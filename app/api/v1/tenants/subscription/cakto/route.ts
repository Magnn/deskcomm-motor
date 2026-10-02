/**
 * POST /api/v1/tenants/subscription/cakto — o aviso de pagamento da Cakto, direto.
 *
 * É o endereço que o DONO DA INSTALAÇÃO cola no webhook da Cakto do produto da
 * assinatura. Sem orquestrador no meio: a rota lê o aviso do jeito que a Cakto
 * manda e aplica a regra.
 *
 * Há dois jeitos de vender, e a oferta declarada no `.env` diz qual vale:
 *
 * ── Oferta que vende um PLANO (`código=plano`) ─────────────────────────────────────
 *   O cliente já pode ter conta (cadastro grátis). Pagou → o plano dele fica em
 *   dia e ele passa a poder conectar número; se ainda não tinha conta, a empresa
 *   é criada. Deixou de pagar → o plano cai e os números param de automatizar,
 *   mas a conta continua aberta. Regra em `lib/planos/pagamento-do-plano.ts`.
 *
 * ── Oferta sem plano (só o código) ─────────────────────────────────────────────────
 *   A assinatura libera a empresa inteira: pagou → empresa criada/reativada;
 *   deixou de pagar → empresa SUSPENSA. Regra em `lib/tenants/assinatura.ts`.
 *
 * Nos dois, o cliente novo recebe por E-MAIL o link para definir a senha (ninguém
 * lê a resposta desta rota), e os avisos que não mudam nada (Pix gerado, carrinho
 * abandonado, tentativa recusada…) respondem 200 sem efeito.
 *
 * ─── As guardas ─────────────────────────────────────────────────────────────────────
 * A porta nasce FECHADA: só existe com `CAKTO_SUBSCRIPTION_SECRET` (o segredo que a
 * Cakto gera ao criar o webhook) E `CAKTO_SUBSCRIPTION_PRODUCTS` (o produto da
 * assinatura). Sem os dois, 404. A origem é conferida antes de qualquer leitura do
 * aviso; as falhas contam por IP, como em `/api/v1/tenants/provision`.
 *
 * ─── Por que quase tudo responde 200 ────────────────────────────────────────────────
 * A Cakto só reenvia quando NÃO recebe resposta. Um aviso válido que não se aplica
 * (outro produto, cliente que nunca foi criado) é um desfecho, não um erro — e o
 * `resultado` do corpo é o que aparece no histórico de eventos dela.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit, peekRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { EmailJaTemContaError, ProvisionConflictError } from "@/lib/auth/provision";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { planoPorId } from "@/lib/planos/catalogo";
import { planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { aplicarPagamentoDoPlano, aplicarQuedaDoPlano } from "@/lib/planos/pagamento-do-plano";
import { ativarAssinatura, suspenderAssinatura } from "@/lib/tenants/assinatura";
import {
  avisoVeioDaCakto,
  decisaoDoEvento,
  eventoDoAviso,
  lerAvisoDeAssinatura,
  motivoDaSuspensao,
  produtoDoAviso,
  produtosDaAssinatura,
  type ProdutoDaAssinatura,
} from "@/lib/tenants/assinatura-cakto";
import { enviarBoasVindasDaAssinatura } from "@/lib/tenants/boas-vindas-da-assinatura";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTEGRACAO = "cakto";
const FALHAS_POR_MINUTO = 10;
/** Um aviso da Cakto tem poucos KB; acima disto não é ela. */
const TAMANHO_MAXIMO_DO_CORPO = 256 * 1024;

function configuracao(): { segredo: string; produtos: ProdutoDaAssinatura[] } | null {
  const segredo = env.CAKTO_SUBSCRIPTION_SECRET.trim();
  const produtos = produtosDaAssinatura(env.CAKTO_SUBSCRIPTION_PRODUCTS);
  return segredo !== "" && produtos.length > 0 ? { segredo, produtos } : null;
}

/**
 * Manda o link de acesso a quem acabou de ter a empresa criada. Devolve se o
 * e-mail saiu — e registra alto quando não saiu, SEM o link (é credencial de uso único).
 */
async function entregarAcesso(p: {
  requestId: string;
  organizationId: string;
  nome: string;
  email: string;
  linkDeAcesso: string | null;
}): Promise<boolean> {
  if (p.linkDeAcesso === null) {
    logger.error("[tenants.subscription.cakto] empresa criada SEM link de acesso — o cliente entra por 'Esqueci minha senha'", {
      requestId: p.requestId,
      organizationId: p.organizationId,
    });
    return false;
  }
  const envio = await enviarBoasVindasDaAssinatura({
    organizationId: p.organizationId,
    nome: p.nome,
    email: p.email,
    linkDeAcesso: p.linkDeAcesso,
  });
  if (!envio.enviado) {
    logger.error("[tenants.subscription.cakto] empresa criada, mas o e-mail de acesso NÃO saiu", {
      requestId: p.requestId,
      organizationId: p.organizationId,
      motivo: envio.motivo,
      detalhe: envio.detalhe,
    });
  }
  return envio.enviado;
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const config = configuracao();
  if (!config) return fail("not_found", "Not found.", 404, { requestId });

  const ip = ipDoCliente(req.headers);
  const balde = ip === null ? null : `tenants_subscription_cakto:falha:ip:${ip}`;
  const falhas = balde === null ? 0 : await peekRateLimit(balde, 60);
  if (balde !== null && falhas >= FALHAS_POR_MINUTO) {
    return fail("rate_limited", "Too many requests.", 429, { requestId, headers: { "Retry-After": "60" } });
  }

  // O corpo CRU: a assinatura do cabeçalho é calculada sobre ele, byte a byte.
  const corpoCru = await req.text();
  let payload: unknown = null;
  if (corpoCru.length <= TAMANHO_MAXIMO_DO_CORPO) {
    try {
      payload = JSON.parse(corpoCru);
    } catch {
      payload = null;
    }
  }

  const autentico =
    payload !== null &&
    avisoVeioDaCakto({
      corpoCru,
      payload,
      assinatura: req.headers.get("x-cakto-signature"),
      carimbo: req.headers.get("x-cakto-timestamp"),
      segredo: config.segredo,
      agoraMs: Date.now(),
    });
  if (!autentico) {
    if (balde !== null) await checkRateLimit(balde, FALHAS_POR_MINUTO, 60);
    return fail("unauthenticated", "Credencial inválida.", 401, { requestId });
  }

  const desfecho = (resultado: string, extra: Record<string, unknown> = {}) =>
    ok({ resultado, ...extra }, { requestId, headers: { "Cache-Control": "no-store" } });

  const evento = eventoDoAviso(payload) ?? "";
  const decisao = decisaoDoEvento(evento);
  if (decisao === "ignorar") return desfecho("ignorado", { motivo: "evento_sem_efeito", evento });

  const aviso = lerAvisoDeAssinatura(payload);
  if (aviso === null) {
    logger.warn("[tenants.subscription.cakto] aviso sem e-mail do cliente", { requestId, evento });
    return desfecho("ignorado", { motivo: "aviso_sem_email_do_cliente", evento });
  }
  const oferta = produtoDoAviso(aviso, config.produtos);
  if (oferta === null) return desfecho("ignorado", { motivo: "outro_produto", evento });

  const email = aviso.cliente.email;
  const nome = aviso.cliente.nome ?? email.split("@")[0] ?? email;
  const motivo = motivoDaSuspensao(evento);

  try {
    // ── Oferta que vende um PLANO ──────────────────────────────────────────────
    if (oferta.plano !== null) {
      if (planoPorId(planosDaInstalacao(), oferta.plano) === null) {
        // Erro de configuração do dono, não do comprador: a oferta aponta para um
        // plano que o catálogo não tem. Aceitar daria um plano sem limite nenhum.
        logger.error("[tenants.subscription.cakto] a oferta aponta para um plano que não existe no catálogo", {
          requestId,
          plano: oferta.plano,
          oferta: oferta.codigoOriginal,
        });
        return desfecho("ignorado", { motivo: "plano_desconhecido", evento });
      }

      if (decisao === "suspender") {
        const r = await aplicarQuedaDoPlano({ integration: INTEGRACAO, email, motivo: motivo ?? "Assinatura inativa.", requestId });
        if (!r.ok) return desfecho("ignorado", { motivo: r.motivo, evento });
        logger.info("[tenants.subscription.cakto] plano inativado", { requestId, evento, pedido: aviso.pedidoId, organizationId: r.organizationId });
        return desfecho("plano_inativo", { organization_id: r.organizationId, flows_stopped: r.fluxosEncerrados });
      }

      const r = await aplicarPagamentoDoPlano({ integration: INTEGRACAO, email, nome, planoId: oferta.plano, requestId });
      if (!r.ok) {
        logger.warn("[tenants.subscription.cakto] pagamento de plano sem empresa para receber", { requestId, evento, pedido: aviso.pedidoId, motivo: r.motivo });
        return desfecho("ignorado", { motivo: r.motivo, evento });
      }
      const emailEnviado = r.criada
        ? await entregarAcesso({ requestId, organizationId: r.organizationId, nome, email, linkDeAcesso: r.linkDeAcesso })
        : null;
      logger.info("[tenants.subscription.cakto] plano em dia", {
        requestId,
        evento,
        pedido: aviso.pedidoId,
        organizationId: r.organizationId,
        plano: oferta.plano,
        criada: r.criada,
      });
      return desfecho("plano_ativo", {
        organization_id: r.organizationId,
        plano: oferta.plano,
        ...(emailEnviado === null ? {} : { email_enviado: emailEnviado }),
      });
    }

    // ── Oferta sem plano: a assinatura libera/suspende a empresa inteira ───────
    const dados = {
      integration: INTEGRACAO,
      externalId: email,
      organizationName: nome,
      ownerEmail: email,
      ownerName: nome,
      reason: motivo,
      requestId,
    };

    if (decisao === "suspender") {
      const r = await suspenderAssinatura(dados);
      // Reembolso/cancelamento de quem nunca virou empresa aqui: nada a suspender.
      if (!r.ok) return desfecho("ignorado", { motivo: r.motivo, evento });
      logger.info("[tenants.subscription.cakto] empresa suspensa", {
        requestId,
        evento,
        pedido: aviso.pedidoId,
        organizationId: r.organizationId,
        fluxosEncerrados: r.fluxosEncerrados,
      });
      return desfecho("suspensa", { organization_id: r.organizationId, flows_stopped: r.fluxosEncerrados });
    }

    const r = await ativarAssinatura(dados);
    if (!r.ok) return desfecho("ignorado", { motivo: r.motivo, evento });
    const emailEnviado = r.criada
      ? await entregarAcesso({ requestId, organizationId: r.organizationId, nome, email, linkDeAcesso: r.linkDeAcesso })
      : null;
    logger.info("[tenants.subscription.cakto] empresa liberada", {
      requestId,
      evento,
      pedido: aviso.pedidoId,
      organizationId: r.organizationId,
      criada: r.criada,
    });
    return desfecho(r.criada ? "criada" : "ativa", {
      organization_id: r.organizationId,
      ...(emailEnviado === null ? {} : { email_enviado: emailEnviado }),
    });
  } catch (err) {
    if (err instanceof EmailJaTemContaError) {
      // Quem pagou já tem conta nesta instalação (entrou por convite ou cadastro):
      // um aviso de pagamento não pode tomar a conta de ninguém. Fica para uma pessoa.
      logger.warn("[tenants.subscription.cakto] o e-mail do comprador já tem conta — empresa não criada", {
        requestId,
        evento,
        pedido: aviso.pedidoId,
      });
      return desfecho("ignorado", { motivo: "email_ja_tem_conta", evento });
    }
    if (err instanceof ProvisionConflictError) {
      return fail(
        "provisioning_conflict",
        "Já existe uma organização com este identificador que não nasceu deste provisionamento.",
        409,
        { requestId },
      );
    }
    logger.error("[tenants.subscription.cakto] falhou", {
      requestId,
      evento,
      pedido: aviso.pedidoId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Não foi possível aplicar a assinatura.", 500, { requestId });
  }
}
