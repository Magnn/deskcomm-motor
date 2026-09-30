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

import { encontrarContatoPorTelefone } from "@/lib/channels/contato-por-telefone";
import { enrollFollowupFlow } from "@/lib/followup/enroll";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { slugDoTrabalho, type CompraDaCakto } from "@/lib/webhooks/cakto";

export type ResultadoDaCompra =
  | { resultado: "entrega_iniciada"; contatoId: string; trabalho: string | null }
  | { resultado: "ja_processada"; contatoId: string }
  | { resultado: "contato_nao_encontrado" }
  | { resultado: "compra_registrada_sem_fluxo"; contatoId: string; motivo: string }
  | { resultado: "reembolso_registrado"; contatoId: string }
  | { resultado: "fluxos_do_evento_iniciados"; contatoId: string; quantidade: number }
  | { resultado: "ignorada"; evento: string };

export interface DepsDaCompra {
  acharContato(c: { telefone: string | null; email: string | null }): Promise<{ id: string; tags: string[] } | null>;
  gravarCompra(contatoId: string, patch: { tags: string[]; ultimaCompra: Record<string, unknown> }): Promise<void>;
  anotar(contatoId: string, texto: string): Promise<void>;
  pararFluxosVivos(contatoId: string, motivo: string): Promise<number>;
  acharFluxoDeEntrega(): Promise<string | null>;
  inscrever(contatoId: string, fluxoId: string): Promise<{ ok: true } | { ok: false; motivo: string }>;
  /** Fluxos ATIVOS cujo gatilho é «evento de pagamento» deste evento da Cakto. */
  fluxosDoEvento(evento: string): Promise<string[]>;
  /** Acrescenta marcas ao contato sem tocar no resto do cadastro. */
  adicionarTags(contatoId: string, tags: string[]): Promise<void>;
}

/**
 * O FILTRO POR EVENTO. O dono escolhe, no gatilho do fluxo, QUAL aviso da Cakto o inicia
 * (compra aprovada, Pix gerado, carrinho abandonado, reembolso…). Até aqui só a compra
 * aprovada fazia algo — e escolhia o fluxo pelo NOME começar com «Entrega».
 *
 * Idempotência por pedido+evento: a Cakto reenvia o mesmo aviso, e um fluxo que já terminou
 * não pode recomeçar por causa do reenvio. Fluxo já vivo para o contato também não duplica
 * (o banco permite um só) — `inscrever` devolve `ok:false` e isso NÃO é falha.
 */
async function dispararFluxosDoEvento(
  deps: DepsDaCompra,
  compra: CompraDaCakto,
  contato: { id: string; tags: string[] },
): Promise<{ configurados: number; iniciados: number; motivo?: string }> {
  const fluxos = await deps.fluxosDoEvento(compra.evento);
  if (fluxos.length === 0) return { configurados: 0, iniciados: 0 };
  const marca = `cakto:${compra.evento}:${compra.pedidoId}`;
  if (contato.tags.includes(marca)) return { configurados: fluxos.length, iniciados: 0, motivo: "evento já aplicado" };
  let iniciados = 0;
  let motivo: string | undefined;
  for (const fluxo of fluxos) {
    const r = await deps.inscrever(contato.id, fluxo);
    if (r.ok) iniciados++;
    else motivo = r.motivo;
  }
  if (iniciados > 0) await deps.adicionarTags(contato.id, [marca]);
  return { configurados: fluxos.length, iniciados, ...(motivo !== undefined ? { motivo } : {}) };
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
    // Quem configurou um fluxo para este evento (ex.: «pedir desculpas e entender o motivo») o vê começar
    // DEPOIS de os fluxos vivos pararem — senão o próprio aviso o cancelaria.
    await dispararFluxosDoEvento(deps, compra, c);
    return { resultado: "reembolso_registrado", contatoId: c.id };
  }

  if (compra.evento !== "purchase_approved") {
    // Pix gerado, abandono, recusa, assinatura…: só há o que fazer se um fluxo pediu este evento.
    if ((await deps.fluxosDoEvento(compra.evento)).length === 0) return { resultado: "ignorada", evento: compra.evento };
    const c = await deps.acharContato(compra.cliente);
    if (c === null) return { resultado: "contato_nao_encontrado" };
    const r = await dispararFluxosDoEvento(deps, compra, c);
    return r.iniciados > 0
      ? { resultado: "fluxos_do_evento_iniciados", contatoId: c.id, quantidade: r.iniciados }
      : { resultado: "ja_processada", contatoId: c.id };
  }

  const contato = await deps.acharContato(compra.cliente);
  if (contato === null) return { resultado: "contato_nao_encontrado" };

  // Idempotência: a Cakto reenvia o aviso; a marca do pedido é o que impede a segunda entrega.
  const marcaDoPedido = `compra:${compra.pedidoId}`;
  if (contato.tags.includes(marcaDoPedido)) return { resultado: "ja_processada", contatoId: contato.id };

  await deps.gravarCompra(contato.id, {
    tags: unir(contato.tags, ["pago", `produto:${trabalho ?? "outro"}`, marcaDoPedido]),
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

  // Quem pagou não pode continuar recebendo a cobrança de "quer continuar?".
  await deps.pararFluxosVivos(contato.id, "compra_aprovada");

  // Um fluxo que escolheu «Compra aprovada» como gatilho é QUEM entrega. Só sem nenhum, vale o
  // legado: o fluxo ativo cujo nome começa com «Entrega».
  const doEvento = await dispararFluxosDoEvento(deps, compra, contato);
  if (doEvento.configurados > 0) {
    return doEvento.iniciados > 0
      ? { resultado: "entrega_iniciada", contatoId: contato.id, trabalho }
      : { resultado: "compra_registrada_sem_fluxo", contatoId: contato.id, motivo: doEvento.motivo ?? "nenhum fluxo iniciado" };
  }

  const fluxo = await deps.acharFluxoDeEntrega();
  if (fluxo === null) {
    return { resultado: "compra_registrada_sem_fluxo", contatoId: contato.id, motivo: "nenhum fluxo de entrega ativo" };
  }
  const inscricao = await deps.inscrever(contato.id, fluxo);
  if (!inscricao.ok) {
    return { resultado: "compra_registrada_sem_fluxo", contatoId: contato.id, motivo: inscricao.motivo };
  }
  return { resultado: "entrega_iniciada", contatoId: contato.id, trabalho };
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

    async acharFluxoDeEntrega() {
      const { data } = await admin
        .from("followup_flow_pointers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .ilike("name", "Entrega%")
        .order("updated_at", { ascending: false })
        .limit(1);
      return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
    },

    async fluxosDoEvento(evento) {
      const { data } = await admin
        .from("followup_flow_pointers")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .eq("trigger_config->>kind", "payment_event")
        .eq("trigger_config->params->>provider", "cakto")
        .eq("trigger_config->params->>event", evento)
        .order("created_at", { ascending: true });
      return ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
    },

    async adicionarTags(contatoId, novas) {
      const { data } = await admin
        .from("contacts")
        .select("tags")
        .eq("organization_id", organizationId)
        .eq("id", contatoId)
        .maybeSingle();
      const atuais = ((data as { tags?: string[] } | null)?.tags ?? []) as string[];
      await admin
        .from("contacts")
        .update({ tags: unir(atuais, novas) })
        .eq("organization_id", organizationId)
        .eq("id", contatoId);
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
