/** O livro de envios é a fila durável das avulsas recusadas por instabilidade.
 * O cron dos marcos chama esta recuperação mesmo quando não há mensagem nova.
 * Valor, moeda e hora vêm da cobrança original; estorno/ajuste impede reenvio.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { reportarCompraAvulsa } from "./compra-avulsa";

const DIA_MS = 24 * 60 * 60 * 1000;
export const INTERVALO_DE_RECUPERACAO_MS = 15 * 60 * 1000;

export function referenciaDaAvulsa(eventoId: string | null): string | null {
  if (!eventoId?.startsWith("avulsa:") || !eventoId.endsWith(":Purchase")) return null;
  const referencia = eventoId.slice(7, -9);
  return referencia.length > 0 ? referencia : null;
}

export async function recuperarAvulsas(admin: SupabaseClient, agora = new Date()): Promise<{ tentadas: number; enviadas: number }> {
  const resumo = { tentadas: 0, enviadas: 0 };
  const { data, error } = await admin.from("ad_conversion_dispatches")
    .select("id, organization_id, lead_id, event_id, attempted_at, value_cents, currency")
    .eq("event_name", "Purchase").eq("status", "error").eq("reason", "plataforma_instavel")
    .gte("created_at", new Date(agora.getTime() - 7 * DIA_MS).toISOString())
    .lte("attempted_at", new Date(agora.getTime() - INTERVALO_DE_RECUPERACAO_MS).toISOString())
    .order("attempted_at", { ascending: true }).limit(2);
  if (error) throw new Error(`recuperação de conversões: ${error.message}`);

  for (const pendente of data ?? []) {
    const org = pendente.organization_id as string;
    try {
      const referencia = referenciaDaAvulsa(pendente.event_id);
      if (!referencia) continue;
      // Claim por comparação: dois crons não reenviam simultaneamente a mesma compra.
      const { data: claim, error: claimError } = await admin.from("ad_conversion_dispatches")
        .update({ attempted_at: agora.toISOString() }).eq("organization_id", org)
        .eq("id", pendente.id).eq("status", "error").eq("attempted_at", pendente.attempted_at)
        .select("id").maybeSingle();
      if (claimError) throw new Error(claimError.message);
      if (!claim) continue;

      const { data: lead, error: leadError } = await admin.from("crm_leads").select("contact_id")
        .eq("organization_id", org).eq("id", pendente.lead_id).maybeSingle();
      if (leadError) throw new Error(leadError.message);
      if (!lead?.contact_id) continue;
      const { data: cobranca, error: chargeError } = await admin.from("revenue_ledger")
        .select("id, amount_cents, currency, occurred_at, metadata, provider")
        .eq("organization_id", org).eq("contact_id", lead.contact_id)
        .eq("event_type", "charge").eq("external_event_id", referencia).maybeSingle();
      if (chargeError) throw new Error(chargeError.message);
      if (!cobranca) continue;
      const idade = agora.getTime() - new Date(cobranca.occurred_at).getTime();
      if (!Number.isFinite(idade) || idade < 0 || idade >= 7 * DIA_MS) continue;
      if (Number(cobranca.amount_cents) !== Number(pendente.value_cents) || cobranca.currency !== pendente.currency) continue;

      const { data: estornos, error: refundError } = await admin.from("revenue_ledger").select("id")
        .eq("organization_id", org).eq("provider", cobranca.provider).eq("external_event_id", referencia)
        .in("event_type", ["refund", "chargeback"]).limit(1);
      if (refundError) throw new Error(refundError.message);
      const { data: ajustes, error: adjustmentError } = await admin.from("revenue_ledger").select("id")
        .eq("organization_id", org).eq("event_type", "adjustment").eq("related_event_id", cobranca.id).limit(1);
      if (adjustmentError) throw new Error(adjustmentError.message);
      if (estornos?.length || ajustes?.length) continue;

      resumo.tentadas += 1;
      const r = await reportarCompraAvulsa(admin, {
        organizationId: org, contactId: lead.contact_id, referencia,
        negocioId: pendente.lead_id,
        valorCentavos: Number(cobranca.amount_cents), moeda: cobranca.currency,
        ocorridaEm: new Date(cobranca.occurred_at),
        produto: typeof cobranca.metadata?.produto === "string" ? cobranca.metadata.produto : null,
      });
      if (r.status === "sent") resumo.enviadas += 1;
    } catch (err) {
      logger.warn("[conversoes.recuperacao] avulsa continua pendente", {
        organization_id: org, envio_id: pendente.id,
        erro: err instanceof Error ? err.message : "falha inesperada",
      });
    }
  }
  return resumo;
}
