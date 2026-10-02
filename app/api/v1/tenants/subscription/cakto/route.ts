/**
 * POST /api/v1/tenants/subscription/cakto — o aviso de pagamento da Cakto, direto.
 *
 * É o endereço que o DONO DA INSTALAÇÃO cola no webhook da Cakto do produto da
 * assinatura. Faz o mesmo que `POST /api/v1/tenants/subscription`, sem orquestrador
 * no meio: a rota lê o aviso do jeito que a Cakto manda e chama a mesma regra.
 *
 *   pagou / renovou / voltou a pagar → a empresa do cliente existe e está liberada.
 *     No primeiro pagamento ela é criada e o cliente recebe, por E-MAIL, o link
 *     para definir a senha (ninguém lê a resposta desta rota).
 *   cancelou / atrasou / pausou / reembolso / chargeback → a empresa é suspensa e
 *     os fluxos em andamento param.
 *   demais avisos (Pix gerado, carrinho abandonado, tentativa recusada…) → 200, sem efeito.
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
import { ativarAssinatura, suspenderAssinatura } from "@/lib/tenants/assinatura";
import {
  avisoVeioDaCakto,
  decisaoDoEvento,
  eventoDoAviso,
  lerAvisoDeAssinatura,
  motivoDaSuspensao,
  produtoEhDaAssinatura,
  produtosDaAssinatura,
} from "@/lib/tenants/assinatura-cakto";
import { enviarBoasVindasDaAssinatura } from "@/lib/tenants/boas-vindas-da-assinatura";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTEGRACAO = "cakto";
const FALHAS_POR_MINUTO = 10;
/** Um aviso da Cakto tem poucos KB; acima disto não é ela. */
const TAMANHO_MAXIMO_DO_CORPO = 256 * 1024;

function configuracao(): { segredo: string; produtos: string[] } | null {
  const segredo = env.CAKTO_SUBSCRIPTION_SECRET.trim();
  const produtos = produtosDaAssinatura(env.CAKTO_SUBSCRIPTION_PRODUCTS);
  return segredo !== "" && produtos.length > 0 ? { segredo, produtos } : null;
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
  if (!produtoEhDaAssinatura(aviso, config.produtos)) {
    return desfecho("ignorado", { motivo: "outro_produto", evento });
  }

  const nome = aviso.cliente.nome ?? aviso.cliente.email.split("@")[0] ?? aviso.cliente.email;
  const dados = {
    integration: INTEGRACAO,
    externalId: aviso.cliente.email,
    organizationName: nome,
    ownerEmail: aviso.cliente.email,
    ownerName: nome,
    reason: motivoDaSuspensao(evento),
    requestId,
  };

  try {
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

    let emailEnviado: boolean | null = null;
    if (r.criada) {
      if (r.linkDeAcesso === null) {
        emailEnviado = false;
        logger.error("[tenants.subscription.cakto] empresa criada SEM link de acesso — o cliente entra por 'Esqueci minha senha'", {
          requestId,
          organizationId: r.organizationId,
        });
      } else {
        const envio = await enviarBoasVindasDaAssinatura({
          organizationId: r.organizationId,
          nome,
          email: aviso.cliente.email,
          linkDeAcesso: r.linkDeAcesso,
        });
        emailEnviado = envio.enviado;
        if (!envio.enviado) {
          // O link NUNCA vai para o log: é credencial de uso único.
          logger.error("[tenants.subscription.cakto] empresa criada, mas o e-mail de acesso NÃO saiu", {
            requestId,
            organizationId: r.organizationId,
            motivo: envio.motivo,
            detalhe: envio.detalhe,
          });
        }
      }
    }

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
