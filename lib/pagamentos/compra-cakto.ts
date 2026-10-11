/**
 * O QUE UMA COMPRA FAZ NO CRM — pagou, a entrega começa; reembolsou, ela para.
 *
 * O aviso da Cakto chega SEM conversa: a pessoa pagou o link que a agente mandou, mas o
 * pagamento não passa pelo WhatsApp. Este módulo faz a ponte:
 *
 *   purchase_approved → acha a pessoa (telefone do checkout, senão e-mail) → marca `pago`,
 *     `produto:<trabalho>` e `compra:<pedido>` (a chave de idempotência) → anota na linha do
 *     tempo → tira a pessoa dos follow-ups de RECUPERAÇÃO (quem pagou não recebe "quer
 *     continuar?") → inscreve no fluxo de ENTREGA, cuja mensagem quem escreve é a agente.
 *   refund / chargeback → marca, anota e PARA os fluxos vivos; nenhum entregável novo sai.
 *   demais eventos → só registrados (Pix gerado, abandono…): não há o que entregar.
 *
 * ─── Por que DEPENDÊNCIAS injetadas ─────────────────────────────────────────────────────
 * A orquestração é a parte que erra sem barulho (reenvio duplicado, pagante que continua no
 * follow-up, compra sem contato). Com as pontas injetadas ela se testa sem banco; a fábrica
 * `depsReais` liga o Supabase e é fina.
 *
 * ─── O que NÃO faz ──────────────────────────────────────────────────────────────────────
 * Não cria conversa nem manda mensagem: só a agente escreve, pelo fluxo, dentro da janela de
 * 24h e da cadeia de guardrails. Compra de quem NUNCA falou no WhatsApp (`contato_nao_encontrado`)
 * fica para uma pessoa: não há janela aberta, e mensagem fora dela exige template aprovado.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { conversaoDeVendaHandler } from "@/lib/conversoes/envio.handler";

import { nomeCasaComCompra } from "@/lib/catalogo/oferta-da-vez";
import { lerCatalogo } from "@/lib/catalogo/tipos";
import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { slugDoProduto } from "@/lib/preco/pos-venda";
import { slugDoTrabalho, type CompraDaCakto } from "@/lib/webhooks/cakto";

export type ResultadoDaCompra =
  | { resultado: "entrega_iniciada"; contatoId: string; trabalho: string | null }
  | { resultado: "ja_processada"; contatoId: string }
  | { resultado: "contato_nao_encontrado" }
  | { resultado: "compra_registrada_sem_fluxo"; contatoId: string; motivo: string }
  | { resultado: "reembolso_registrado"; contatoId: string }
  | { resultado: "ignorada"; evento: string };

export interface DepsDaCompra {
  acharContato(c: { telefone: string | null; email: string | null }): Promise<{ id: string; tags: string[] } | null>;
  gravarCompra(contatoId: string, patch: { tags: string[]; ultimaCompra: Record<string, unknown> }): Promise<void>;
  anotar(contatoId: string, texto: string): Promise<void>;
  /**
   * Grava o valor pago no NEGÓCIO do contato e, se ele já estiver fechado como ganho, reporta a
   * venda à plataforma de anúncio. Nunca lança: a compra já está registrada, e a entrega não pode
   * esperar por isto.
   */
  registrarValorNoNegocio(contatoId: string, valorCentavos: number): Promise<void>;
  pararFluxosVivos(contatoId: string, motivo: string): Promise<number>;
  acharFluxoDeEntrega(produtoNome: string | null): Promise<string | null>;
  inscrever(contatoId: string, fluxoId: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
}

export interface FluxoDeEntrega {
  id: string;
  /** O produto que este fluxo entrega (`trigger_config.product_name`). `null` = fluxo geral. */
  produto: string | null;
}

const semAcentoMinusculo = (s: string): string =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * QUAL FLUXO ENTREGA ESTA COMPRA. Pura.
 *
 * Até 09/10/2026 toda compra aprovada caía no mesmo fluxo — o primeiro chamado "Entrega…". Com um
 * segundo produto à venda (uma oferta de pós-venda, por exemplo), quem o comprasse recebia a entrega
 * do produto principal de novo, e o material que pagou não saía.
 *
 * A regra: o fluxo que DECLARA o produto (no gatilho) fica com as compras dele; o fluxo sem produto
 * declarado é o geral e fica com todo o resto. `fluxos` vem do mais recente para o mais antigo.
 */
export function escolherFluxoDeEntrega(
  fluxos: readonly FluxoDeEntrega[],
  produtoNome: string | null,
  /**
   * Este produto é entregue NA CONVERSA pela agente (aba "Catálogo")? Então só serve o fluxo que o
   * declara: o fluxo geral é a entrega de OUTRO produto, e quem pagou uma leitura receberia o material
   * do produto principal.
   */
  entregueNaConversa = false,
): string | null {
  const comprado = produtoNome === null ? "" : semAcentoMinusculo(produtoNome);
  if (comprado !== "") {
    const doProduto = fluxos.find((f) => {
      const declarado = f.produto === null ? "" : semAcentoMinusculo(f.produto);
      return declarado !== "" && (comprado === declarado || comprado.includes(declarado));
    });
    if (doProduto) return doProduto.id;
  }
  if (entregueNaConversa) return null;
  return fluxos.find((f) => f.produto === null || f.produto.trim() === "")?.id ?? null;
}

export interface NegocioDoContato {
  id: string;
  status: string;
  value_cents: number | null;
  closed_at: string | null;
  last_activity_at: string | null;
  created_at: string;
}

/** Há quanto tempo um negócio ganho ainda é "o desta compra" (e o que a plataforma de anúncio aceita). */
const JANELA_DO_NEGOCIO_GANHO_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * EM QUAL NEGÓCIO O VALOR ENTRA, e com quanto ele fica. Pura.
 *
 *   - o negócio ABERTO do contato (o mais recente) recebe o valor: é a venda que o agente vai fechar;
 *   - sem aberto, o negócio GANHO mais recente, fechado há até 7 dias: o agente fechou antes de o
 *     aviso de pagamento chegar, ou é uma segunda compra (oferta de pós-venda) — aí o valor SOMA;
 *   - negócio perdido ou ganho antigo não é desta compra: `null`, e nada é escrito.
 */
export function negocioQueRecebeOValor(
  negocios: readonly NegocioDoContato[],
  valorCentavos: number,
  agora: Date,
): { id: string; novoValor: number; jaGanho: boolean } | null {
  const recente = (a: NegocioDoContato, b: NegocioDoContato) =>
    (b.last_activity_at ?? b.created_at).localeCompare(a.last_activity_at ?? a.created_at);
  const aberto = negocios.filter((n) => n.status === "open").sort(recente)[0];
  if (aberto) return { id: aberto.id, novoValor: valorCentavos, jaGanho: false };

  const ganho = negocios
    .filter((n) => n.status === "won" && n.closed_at !== null && agora.getTime() - new Date(n.closed_at).getTime() <= JANELA_DO_NEGOCIO_GANHO_MS)
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""))[0];
  if (!ganho) return null;
  return { id: ganho.id, novoValor: Math.max(0, ganho.value_cents ?? 0) + valorCentavos, jaGanho: true };
}

const reaisTexto = (cents: number | null): string =>
  cents === null ? "valor não informado" : `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

function unir(tags: string[], novas: string[]): string[] {
  return Array.from(new Set([...tags, ...novas]));
}

export async function aplicarEventoDaCakto(deps: DepsDaCompra, compra: CompraDaCakto): Promise<ResultadoDaCompra> {
  const trabalho = slugDoTrabalho(compra.produtoNome);
  const rotuloDoProduto = compra.produtoNome ?? "produto sem nome";

  if (compra.evento === "refund" || compra.evento === "chargeback") {
    const c = await deps.acharContato(compra.cliente);
    if (c === null) return { resultado: "contato_nao_encontrado" };
    const marca = compra.evento === "refund" ? "reembolso" : "chargeback";
    await deps.gravarCompra(c.id, {
      tags: unir(c.tags, [marca]),
      ultimaCompra: { pedido: compra.pedidoId, evento: compra.evento },
    });
    await deps.pararFluxosVivos(c.id, `compra_${marca}`);
    await deps.anotar(c.id, `${marca === "reembolso" ? "Reembolso" : "Chargeback"} na Cakto: ${rotuloDoProduto} (${reaisTexto(compra.valorCentavos)}). Fluxos automáticos parados; uma pessoa deve olhar antes de qualquer nova mensagem.`);
    return { resultado: "reembolso_registrado", contatoId: c.id };
  }

  if (compra.evento !== "purchase_approved") return { resultado: "ignorada", evento: compra.evento };

  const contato = await deps.acharContato(compra.cliente);
  if (contato === null) return { resultado: "contato_nao_encontrado" };

  // Idempotência: a Cakto reenvia o aviso; a marca do pedido é o que impede a segunda entrega.
  const marcaDoPedido = `compra:${compra.pedidoId}`;
  if (contato.tags.includes(marcaDoPedido)) return { resultado: "ja_processada", contatoId: contato.id };

  await deps.gravarCompra(contato.id, {
    // Produto que não é um dos trabalhos ganha a marca pelo próprio nome (`produto:sons-vocalicos`):
    // é ela que diz ao pós-venda o que a pessoa JÁ comprou. Com `produto:outro` para todos, a oferta
    // recém-comprada seria oferecida de novo e a sequência nunca andaria.
    tags: unir(contato.tags, ["pago", `produto:${trabalho ?? (slugDoProduto(compra.produtoNome ?? "") || "outro")}`, marcaDoPedido]),
    ultimaCompra: {
      pedido: compra.pedidoId,
      produto: rotuloDoProduto,
      valor_centavos: compra.valorCentavos,
      cupom: compra.cupom,
      metodo: compra.metodo,
      pago_em: compra.pagoEm,
    },
  });
  await deps.anotar(
    contato.id,
    `Compra aprovada na Cakto: ${rotuloDoProduto} (${reaisTexto(compra.valorCentavos)}${compra.cupom ? `, cupom ${compra.cupom}` : ""}). A entrega começa automaticamente.`,
  );

  // O VALOR PAGO VAI PARA O NEGÓCIO. Sem isto o negócio fechava como ganho com valor vazio, e a
  // venda nunca era reportada à plataforma de anúncio: `Purchase` exige valor, e o envio registrava
  // `sem_valor`. Medido em 10/10/2026: 31 vendas na semana, 1 negócio com valor, 18 envios pulados
  // — a Meta otimizava as campanhas sem enxergar nenhuma venda vinda do clique no WhatsApp.
  if (typeof compra.valorCentavos === "number" && compra.valorCentavos > 0) {
    await deps.registrarValorNoNegocio(contato.id, compra.valorCentavos);
  }

  // Quem pagou não pode continuar recebendo a cobrança de "quer continuar?".
  await deps.pararFluxosVivos(contato.id, "compra_aprovada");

  const fluxo = await deps.acharFluxoDeEntrega(compra.produtoNome);
  if (fluxo === null) {
    return { resultado: "compra_registrada_sem_fluxo", contatoId: contato.id, motivo: "nenhum fluxo de entrega ativo" };
  }
  const inscricao = await deps.inscrever(contato.id, fluxo);
  if (!inscricao.ok) {
    return { resultado: "compra_registrada_sem_fluxo", contatoId: contato.id, motivo: inscricao.motivo };
  }
  return { resultado: "entrega_iniciada", contatoId: contato.id, trabalho };
}

/**
 * Algum agente da organização tem este produto no catálogo como entrega NA CONVERSA? O aviso de compra
 * é da organização, não de um agente — por isso a varredura. Falha de leitura = `false`: a compra segue
 * pelo caminho de sempre.
 */
async function entregueNaConversaPorAlgumAgente(
  admin: SupabaseClient,
  organizationId: string,
  produtoNome: string | null,
): Promise<boolean> {
  if (produtoNome === null) return false;
  try {
    const { data } = await admin
      .from("ai_agents")
      .select("config")
      .eq("organization_id", organizationId)
      .is("archived_at", null)
      .limit(50);
    const comprado = [slugDoProduto(produtoNome)];
    return ((data ?? []) as Array<{ config: unknown }>).some((a) =>
      (lerCatalogo(a.config)?.produtos ?? []).some((p) => p.entrega === "conversa" && nomeCasaComCompra(p.nome, comprado)),
    );
  } catch {
    return false;
  }
}

/** As pontas de verdade, ligadas ao Supabase (service role: a org vem SEMPRE da fonte do webhook). */
export function depsReais(admin: SupabaseClient, organizationId: string, requestId: string, webhookSourceId: string): DepsDaCompra {
  return {
    async acharContato({ telefone, email }) {
      let id: string | null = null;
      if (telefone !== null) id = (await encontrarContatoPorTelefone(admin, organizationId, telefone))?.id ?? null;
      if (id === null && email !== null) {
        const { data } = await admin
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .ilike("email", email)
          .is("is_merged_into", null)
          .limit(1)
          .maybeSingle();
        id = (data as { id: string } | null)?.id ?? null;
      }
      if (id === null) return null;
      const { data } = await admin
        .from("contacts")
        .select("tags")
        .eq("organization_id", organizationId)
        .eq("id", id)
        .maybeSingle();
      return { id, tags: ((data as { tags?: string[] } | null)?.tags ?? []) as string[] };
    },

    async gravarCompra(contatoId, { tags, ultimaCompra }) {
      const { data } = await admin
        .from("contacts")
        .select("source_metadata")
        .eq("organization_id", organizationId)
        .eq("id", contatoId)
        .maybeSingle();
      const atual = ((data as { source_metadata?: Record<string, unknown> } | null)?.source_metadata ?? {}) as Record<string, unknown>;
      await admin
        .from("contacts")
        .update({ tags, source_metadata: { ...atual, ultima_compra: ultimaCompra } as never })
        .eq("organization_id", organizationId)
        .eq("id", contatoId);
    },

    async registrarValorNoNegocio(contatoId, valorCentavos) {
      try {
        const { data } = await admin
          .from("crm_leads")
          .select("id, status, value_cents, closed_at, last_activity_at, created_at")
          .eq("organization_id", organizationId)
          .eq("contact_id", contatoId);
        const alvo = negocioQueRecebeOValor((data ?? []) as NegocioDoContato[], valorCentavos, new Date());
        if (alvo === null) return;
        const { error } = await admin
          .from("crm_leads")
          .update({ value_cents: alvo.novoValor })
          .eq("organization_id", organizationId)
          .eq("id", alvo.id);
        if (error) {
          logger.warn("[cakto] valor da compra não foi gravado no negócio", { organization_id: organizationId, detalhe: error.message });
          return;
        }
        // Negócio JÁ ganho: o evento de fechamento passou antes de o valor existir, e o envio da
        // venda foi pulado por `sem_valor`. Ninguém vai emitir o evento de novo — o envio é refeito
        // aqui, pelo mesmo consumidor (ele relê o negócio e não repete venda já enviada). Negócio
        // ainda aberto não precisa: quando fechar, o evento encontra o valor.
        if (alvo.jaGanho) {
          await conversaoDeVendaHandler.handle({
            id: requestId,
            organization_id: organizationId,
            event_type: "lead.won",
            entity_kind: "crm_lead",
            entity_id: alvo.id,
            payload: {},
            metadata: {},
            consumed_by: [],
            attempts: 0,
          });
        }
      } catch (err) {
        logger.warn("[cakto] registro do valor no negócio falhou", {
          organization_id: organizationId,
          detalhe: err instanceof Error ? err.message : String(err),
        });
      }
    },

    async anotar(contatoId, texto) {
      // A linha do tempo é do LEAD do funil (`crm_leads`), não do contato. Quem pagou sem card
      // no funil não tem onde a nota morar: a marca em `tags` e o log do webhook já contam.
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
        sourceModule: "cakto_webhook",
        sourceId: webhookSourceId,
        actor: { type: "webhook_source", id: webhookSourceId },
        reason: texto,
      });
    },

    async pararFluxosVivos(contatoId, motivo) {
      const agora = new Date().toISOString();
      const { data } = await admin
        .from("followup_enrollments")
        .update({
          status: "cancelled",
          outcome: "converted",
          cancel_reason: motivo,
          next_eval_at: null,
          claimed_until: null,
          completed_at: agora,
          updated_at: agora,
        })
        .eq("organization_id", organizationId)
        .eq("contact_id", contatoId)
        .in("status", ["active", "waiting_reply", "paused_handoff"])
        .select("id");
      return (data ?? []).length;
    },

    async acharFluxoDeEntrega(produtoNome) {
      const { data } = await admin
        .from("followup_flow_pointers")
        .select("id, name, trigger_config")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .ilike("name", "Entrega%")
        .order("updated_at", { ascending: false })
        .limit(50);
      const fluxos = ((data ?? []) as Array<{ id: string; trigger_config: { product_name?: unknown } | null }>).map((f) => ({
        id: f.id,
        produto: typeof f.trigger_config?.product_name === "string" ? f.trigger_config.product_name : null,
      }));
      return escolherFluxoDeEntrega(fluxos, produtoNome, await entregueNaConversaPorAlgumAgente(admin, organizationId, produtoNome));
    },

    async inscrever(contatoId, fluxoId) {
      const r = await enrollFollowupFlow(admin, {
        organizationId,
        pointerId: fluxoId,
        contactId: contatoId,
        actorUserId: null,
        requestId,
      });
      return r.ok ? { ok: true } : { ok: false, motivo: `${r.code}: ${r.message}` };
    },
  };
}
