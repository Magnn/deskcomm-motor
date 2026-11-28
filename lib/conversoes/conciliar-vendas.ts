/**
 * CONCILIAÇÃO: o livro de receita contra o livro de envios. Toda venda dos últimos dias de quem veio de anúncio tem de
 * ter virado compra na plataforma; a que não virou é enviada agora, como compra avulsa (id = referência da cobrança).
 *
 * Medido em 27/11/2026: R$ 65 de uma cliente de anúncio, registrados à mão sem negócio aberto, nunca chegaram à Meta, e
 * só uma conferência manual achou. Cada caminho de envio tem a sua regra; esta é a rede que fecha o laço quando um
 * deles falha. Não envia o que já foi decidido: qualquer linha do envio da cobrança (enviada, pulada ou recusada) ou o
 * envio do fechamento do negócio perto da hora da venda contam como reportados — nunca duas compras pela mesma venda.
 *
 * Quem não veio de anúncio não é lido: sem clique não há compra a atribuir, e mandar o telefone dessa pessoa à
 * plataforma seria outra decisão (público de remarketing), que não é desta conciliação.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { idDoEventoDaCompraAvulsa, reportarCompraAvulsa } from "./compra-avulsa";

const MIN_MS = 60 * 1000;
const HORA_MS = 60 * MIN_MS;
const DIA_MS = 24 * HORA_MS;
/** A plataforma recusa evento com mais de 7 dias; meio dia de folga para a venda não vencer no meio do envio. */
const JANELA_MS = 6.5 * DIA_MS;
/** Os caminhos normais têm este tempo para enviar antes de a conciliação se meter. */
const CARENCIA_MS = 30 * MIN_MS;
/** O envio do fechamento do negócio (`<negócio>:Purchase`) é o desta venda se saiu nesta faixa em volta dela. */
const ANTES_MS = 2 * HORA_MS;
const DEPOIS_MS = 2 * DIA_MS;
const POR_RODADA = 3;
export const INTERVALO_DA_CONCILIACAO_MS = 30 * MIN_MS;

export interface EnvioDeCompra {
  event_id: string | null;
  created_at: string;
}

/**
 * A venda já foi reportada (ou decidida)? `registradaEm` é quando ela entrou no caixa: venda lançada com data de dias
 * antes tem o envio do fechamento perto do LANÇAMENTO, não da data dela. Pura.
 */
export function vendaJaReportada(referencia: string, ocorridaEm: Date, envios: readonly EnvioDeCompra[], registradaEm: Date = ocorridaEm): boolean {
  const daCobranca = idDoEventoDaCompraAvulsa(referencia);
  const inicio = Math.min(ocorridaEm.getTime(), registradaEm.getTime());
  const fim = Math.max(ocorridaEm.getTime(), registradaEm.getTime());
  return envios.some((e) => {
    if (e.event_id === daCobranca) return true;
    if (e.event_id?.startsWith("avulsa:")) return false;
    const em = new Date(e.created_at).getTime();
    return em >= inicio - ANTES_MS && em <= fim + DEPOIS_MS;
  });
}

// shortcut: relógio em memória do processo; com mais de uma réplica do app cada uma concilia no seu ritmo (o envio é
// idempotente pelo id do evento e pelo livro de envios, então o custo é só leitura). Trocar por marca no banco se escalar.
let ultimaRodada = 0;
/** Venda que a plataforma pulou sem registrar (ex.: plataforma desconhecida): não volta a ocupar a rodada. */
const puladas = new Set<string>();

export async function conciliarVendasNaMeta(admin: SupabaseClient, agora = new Date()): Promise<{ tentadas: number; enviadas: number }> {
  const resumo = { tentadas: 0, enviadas: 0 };
  if (agora.getTime() - ultimaRodada < INTERVALO_DA_CONCILIACAO_MS) return resumo;
  ultimaRodada = agora.getTime();

  const { data: vendas, error } = await admin
    .from("revenue_ledger")
    .select("id, organization_id, contact_id, amount_cents, currency, occurred_at, created_at, external_event_id, provider, metadata")
    .eq("event_type", "charge")
    .gt("amount_cents", 0)
    .not("contact_id", "is", null)
    .not("external_event_id", "is", null)
    .gte("occurred_at", new Date(agora.getTime() - JANELA_MS).toISOString())
    .lte("occurred_at", new Date(agora.getTime() - CARENCIA_MS).toISOString())
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(`conciliação de vendas: ${error.message}`);

  for (const v of vendas ?? []) {
    if (resumo.tentadas >= POR_RODADA) break;
    if (puladas.has(v.id as string)) continue;
    const org = v.organization_id as string;
    try {
      // Só quem veio de anúncio (os mesmos campos que `lerAtribuicao` lê).
      const { data: contato } = await admin.from("contacts").select("source_metadata")
        .eq("organization_id", org).eq("id", v.contact_id).maybeSingle();
      const meta = (contato?.source_metadata ?? {}) as Record<string, unknown>;
      if (!meta.ad_source_id && !meta.fbclid && meta.origem !== "site") continue;

      const { data: negocios } = await admin.from("crm_leads").select("id").eq("organization_id", org).eq("contact_id", v.contact_id);
      const ids = (negocios ?? []).map((n) => n.id as string);
      if (ids.length === 0) continue;
      const { data: envios } = await admin.from("ad_conversion_dispatches").select("event_id, created_at")
        .eq("organization_id", org).eq("event_name", "Purchase").in("lead_id", ids);
      const referencia = v.external_event_id as string;
      if (vendaJaReportada(referencia, new Date(v.occurred_at), (envios ?? []) as EnvioDeCompra[], new Date(v.created_at))) continue;

      const { data: desfeita } = await admin.from("revenue_ledger").select("id")
        .eq("organization_id", org).eq("provider", v.provider).eq("external_event_id", referencia)
        .in("event_type", ["refund", "chargeback"]).limit(1);
      if (desfeita?.length) continue;

      resumo.tentadas += 1;
      const r = await reportarCompraAvulsa(admin, {
        organizationId: org,
        contactId: v.contact_id as string,
        referencia,
        valorCentavos: Number(v.amount_cents),
        moeda: (v.currency as string) ?? "BRL",
        ocorridaEm: new Date(v.occurred_at),
        produto: typeof v.metadata?.produto === "string" ? v.metadata.produto : null,
      });
      if (r.status === "sent") resumo.enviadas += 1;
      else if (r.status === "skipped") puladas.add(v.id as string);
      logger.info("[conversoes.conciliacao] venda sem compra na plataforma — enviada agora", { organization_id: org, receita_id: v.id, status: r.status });
    } catch (err) {
      logger.warn("[conversoes.conciliacao] venda continua sem compra na plataforma", {
        organization_id: org, receita_id: v.id, erro: err instanceof Error ? err.message : "falha inesperada",
      });
    }
  }
  return resumo;
}
