/**
 * O PAGAMENTO QUE NÃO PASSOU PELO CHECKOUT — a pessoa pagou por fora, e alguém da equipe registra.
 *
 * ─── O caso que fez este arquivo existir ─────────────────────────────────────────────
 * Medido em produção em 11/10/2026: um cliente tentou o link de pagamento três vezes, não
 * conseguiu, e pagou por Pix direto na chave da empresa. O checkout nunca soube da venda, então
 * nada do que uma compra faz aconteceu: o contato seguiu como "não pagou" (e o agente voltaria a
 * cobrá-lo), o negócio ficou aberto e sem valor, e a venda não foi reportada à plataforma de
 * anúncio. O conserto foi feito à mão, direto no banco.
 *
 * ─── O que faz ───────────────────────────────────────────────────────────────────────
 * O mesmo que o aviso do checkout (`compra-cakto.ts`), com as mesmas pontas:
 *   marca `pago`, `produto:<nome>` e `compra:<chave>` → anota na linha do tempo, com quem
 *   registrou → grava o valor no negócio → FECHA o negócio aberto como ganho (é o fechamento com
 *   valor que reporta a venda) → tira a pessoa das retomadas → opcionalmente inicia a entrega.
 *
 * A diferença para o checkout é o fechamento: lá o negócio é fechado depois, pelo agente ou pelo
 * fluxo; aqui quem registra está afirmando que o dinheiro entrou, e a venda fecha na hora.
 *
 * ─── Idempotência ────────────────────────────────────────────────────────────────────
 * A tela gera uma chave por abertura do diálogo. Clique duplo ou reenvio encontra a marca
 * `compra:manual-<chave>` e não registra de novo.
 *
 * Orquestração pura, com as pontas injetadas — como `aplicarEventoDaCakto`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerCatalogo } from "@/lib/catalogo/tipos";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { lerPricing } from "@/lib/preco/tipos";
import { slugDoProduto } from "@/lib/preco/pos-venda";

import { depsReais as depsDaCompra, negocioQueRecebeOValor, type DepsDaCompra, type NegocioDoContato } from "./compra-cakto";
import { ROTULO_DO_METODO, type DesfechoDoNegocio, type PagamentoRecebido, type ResultadoDoPagamento, type SugestaoDePagamento } from "./pagamento-recebido-tipos";

export {
  METODOS_DE_PAGAMENTO,
  ROTULO_DO_METODO,
  pagamentoRecebidoSchema,
  type DesfechoDaEntrega,
  type DesfechoDoNegocio,
  type MetodoDePagamento,
  type PagamentoRecebido,
  type ResultadoDoPagamento,
  type SugestaoDePagamento,
} from "./pagamento-recebido-tipos";

export interface DepsDoPagamento extends Pick<DepsDaCompra, "gravarCompra" | "registrarValorNoNegocio" | "pararFluxosVivos" | "acharFluxoDeEntrega" | "inscrever"> {
  lerContato(contatoId: string): Promise<{ id: string; tags: string[] } | null>;
  anotar(contatoId: string, texto: string): Promise<void>;
  /** Os negócios do contato, para decidir qual fecha. */
  negociosDoContato(contatoId: string): Promise<NegocioDoContato[]>;
  /**
   * Grava o fato de dinheiro no ledger de receita — é dele que o Dashboard e a aba Receita somam.
   * Idempotente pela chave do registro. Falha aqui não desfaz o registro: lança, e quem chama decide.
   */
  registrarReceita(contatoId: string, receita: { chave: string; valorCentavos: number; produto: string; metodo: string; pagoEm: string }): Promise<void>;
  /** Fecha o negócio como ganho pela regra de encerramento do produto. `false` = não fechou. */
  fecharComoGanho(leadId: string): Promise<boolean>;
}

const reaisTexto = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

export async function registrarPagamentoRecebido(
  deps: DepsDoPagamento,
  entrada: { contatoId: string; pagamento: PagamentoRecebido; agora: Date },
): Promise<ResultadoDoPagamento> {
  const { contatoId, pagamento, agora } = entrada;
  const contato = await deps.lerContato(contatoId);
  if (contato === null) return { resultado: "contato_nao_encontrado" };

  const marca = `compra:manual-${pagamento.chave}`;
  if (contato.tags.includes(marca)) return { resultado: "ja_registrado" };

  const pagoEm = pagamento.pago_em ?? agora.toISOString();
  await deps.gravarCompra(contato.id, {
    tags: Array.from(new Set([...contato.tags, "pago", `produto:${slugDoProduto(pagamento.produto) || "outro"}`, marca])),
    ultimaCompra: {
      pedido: `manual-${pagamento.chave}`,
      produto: pagamento.produto,
      valor_centavos: pagamento.valor_cents,
      cupom: null,
      metodo: pagamento.metodo,
      pago_em: pagoEm,
    },
  });
  // O dinheiro entra no ledger ANTES do resto: o painel soma o ledger, e uma venda fechada sem ele
  // é a venda que "não aparece no dashboard" (medido em produção em 11/10/2026).
  await deps.registrarReceita(contato.id, {
    chave: pagamento.chave,
    valorCentavos: pagamento.valor_cents,
    produto: pagamento.produto,
    metodo: pagamento.metodo,
    pagoEm,
  });
  await deps.anotar(
    contato.id,
    `Pagamento recebido fora do checkout: ${pagamento.produto} (${reaisTexto(pagamento.valor_cents)}, ${ROTULO_DO_METODO[pagamento.metodo]}). Registrado pela equipe.`,
  );

  // Qual negócio é o desta venda — a mesma régua do checkout. Lida ANTES de gravar o valor: é ela
  // que diz se há um negócio aberto para fechar.
  const alvo = negocioQueRecebeOValor(await deps.negociosDoContato(contato.id), pagamento.valor_cents, agora);
  // Grava o valor (e, se o negócio JÁ estava ganho, refaz o envio da venda — `compra-cakto.ts`).
  await deps.registrarValorNoNegocio(contato.id, pagamento.valor_cents);

  let negocio: DesfechoDoNegocio;
  if (alvo === null) negocio = "sem_negocio";
  else if (alvo.jaGanho) negocio = "ja_estava_ganho";
  // O fechamento vem DEPOIS do valor: é o evento de fechamento que reporta a venda, e ele precisa
  // encontrar o valor gravado.
  else negocio = (await deps.fecharComoGanho(alvo.id)) ? "fechado" : "nao_fechou";

  // Quem pagou não pode continuar recebendo "quer continuar?".
  await deps.pararFluxosVivos(contato.id, "compra_aprovada");

  if (!pagamento.iniciar_entrega) return { resultado: "registrado", negocio, entrega: "nao_pedida" };
  const fluxo = await deps.acharFluxoDeEntrega(pagamento.produto);
  if (fluxo === null) return { resultado: "registrado", negocio, entrega: "sem_fluxo", motivoDaEntrega: "nenhum fluxo de entrega ativo" };
  const inscricao = await deps.inscrever(contato.id, fluxo);
  if (!inscricao.ok) return { resultado: "registrado", negocio, entrega: "sem_fluxo", motivoDaEntrega: inscricao.motivo };
  return { resultado: "registrado", negocio, entrega: "iniciada" };
}

/**
 * As pontas de verdade. `admin` é service-role (a organização vem da SESSÃO de quem registra, nunca
 * do corpo); o fechamento do negócio é injetado pela rota, porque usa o client e o ator do pedido.
 */
export function depsReaisDoPagamento(
  admin: SupabaseClient,
  ctx: { organizationId: string; requestId: string; userId: string; fecharComoGanho: (leadId: string) => Promise<boolean> },
): DepsDoPagamento {
  const { organizationId, requestId, userId } = ctx;
  const daCompra = depsDaCompra(admin, organizationId, requestId, userId);
  return {
    gravarCompra: daCompra.gravarCompra,
    registrarValorNoNegocio: daCompra.registrarValorNoNegocio,
    pararFluxosVivos: daCompra.pararFluxosVivos,
    acharFluxoDeEntrega: daCompra.acharFluxoDeEntrega,
    inscrever: daCompra.inscrever,
    fecharComoGanho: ctx.fecharComoGanho,

    async lerContato(contatoId) {
      const { data } = await admin.from("contacts").select("id, tags").eq("organization_id", organizationId).eq("id", contatoId).maybeSingle();
      const c = data as { id: string; tags: string[] | null } | null;
      return c === null ? null : { id: c.id, tags: c.tags ?? [] };
    },

    async registrarReceita(contatoId, receita) {
      const { error } = await admin.from("revenue_ledger").insert({
        organization_id: organizationId,
        event_type: "charge",
        amount_cents: receita.valorCentavos,
        currency: "BRL",
        provider: "manual",
        external_event_id: `manual-${receita.chave}`,
        occurred_at: receita.pagoEm,
        contact_id: contatoId,
        created_by_user_id: userId,
        metadata: { produto: receita.produto, metodo: receita.metodo },
      });
      // 23505 = o mesmo registro já está no ledger (reenvio): não é falha.
      if (error && error.code !== "23505") throw new Error(`ledger de receita: ${error.message}`);
    },

    async negociosDoContato(contatoId) {
      const { data } = await admin
        .from("crm_leads")
        .select("id, status, value_cents, closed_at, last_activity_at, created_at")
        .eq("organization_id", organizationId)
        .eq("contact_id", contatoId);
      return (data ?? []) as NegocioDoContato[];
    },

    async anotar(contatoId, texto) {
      const { data } = await admin
        .from("crm_leads")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("contact_id", contatoId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const leadId = (data as { id: string } | null)?.id;
      if (leadId === undefined) return;
      await emitLeadActivity(admin, {
        organizationId,
        leadId,
        contactId: contatoId,
        type: "note",
        sourceModule: "pagamento_recebido",
        sourceId: requestId,
        actor: { type: "user", id: userId },
        reason: texto,
      });
    },
  };
}

/**
 * O que oferecer no diálogo: os produtos que o agente da organização vende, com o valor de cada um.
 * Pura. Preço cheio para os da tabela; o valor próprio para as ofertas de pós-venda e do catálogo.
 * Mesmo nome em duas fontes fica com o primeiro valor visto.
 */
export function sugestoesDePagamento(configs: readonly unknown[]): SugestaoDePagamento[] {
  const vistos = new Map<string, SugestaoDePagamento>();
  const por = (produto: string, valor_cents: number) => {
    const nome = produto.trim();
    const chave = slugDoProduto(nome);
    if (nome === "" || chave === "" || vistos.has(chave)) return;
    vistos.set(chave, { produto: nome, valor_cents });
  };
  for (const config of configs) {
    const preco = lerPricing(config);
    if (preco) {
      for (const link of preco.steps[0]?.product_links ?? []) por(link.name, preco.list_price_cents);
      if (preco.post_sale) {
        for (const link of preco.post_sale.product_links) por(link.name, preco.post_sale.price_cents);
        for (const oferta of preco.post_sale.next_offers ?? []) for (const link of oferta.product_links) por(link.name, oferta.price_cents);
      }
    }
    for (const p of lerCatalogo(config)?.produtos ?? []) por(p.nome, p.preco_cents);
  }
  return [...vistos.values()];
}
