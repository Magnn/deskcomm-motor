/**
 * Agenda o turno da oferta da sequência (`proxima-da-sequencia.ts`) depois de uma compra aprovada. Best-effort:
 * a compra já foi aplicada, e falhar aqui não pode desfazê-la — quem chama engole o erro.
 *
 * O turno é um retorno agendado (`cron_jobs` kind `at`, `followup_turn`), o mesmo de quando o agente combina
 * de voltar: ele passa pelos guardrails, pela janela do canal e pela fronteira do atendimento. Um por compra:
 * se já há retorno vivo para o contato, não agenda outro (o combinado com a pessoa vem antes).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ESPERA_DA_OFERTA_DA_SEQUENCIA_MIN, motivoDaOfertaDaSequencia, proximaDaSequencia } from "./proxima-da-sequencia";
import { lerCatalogo } from "./tipos";

export type DesfechoDaSequencia = "agendada" | "nada_a_oferecer" | "ja_ha_retorno";

export async function agendarProximaDaSequencia(
  admin: SupabaseClient,
  organizationId: string,
  contatoId: string,
  comprado: string | null,
  agora: Date = new Date(),
): Promise<DesfechoDaSequencia> {
  const [{ data: agentes }, { data: contato }] = await Promise.all([
    admin.from("ai_agents").select("config").eq("organization_id", organizationId).is("archived_at", null),
    admin.from("contacts").select("tags").eq("organization_id", organizationId).eq("id", contatoId).maybeSingle(),
  ]);
  const tags = ((contato as { tags: string[] | null } | null)?.tags ?? []) as string[];
  let alvo: { produto: NonNullable<ReturnType<typeof proximaDaSequencia>> } | null = null;
  for (const a of (agentes ?? []) as Array<{ config: unknown }>) {
    const p = proximaDaSequencia(lerCatalogo(a.config), comprado, tags);
    if (p !== null) {
      alvo = { produto: p };
      break;
    }
  }
  if (alvo === null || comprado === null) return "nada_a_oferecer";

  const { data: vivo } = await admin
    .from("cron_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("contact_id", contatoId)
    .eq("kind", "at")
    .eq("job_kind", "followup_turn")
    .eq("enabled", true)
    .gt("next_run_at", agora.toISOString())
    .limit(1);
  if ((vivo ?? []).length > 0) return "ja_ha_retorno";

  const { error } = await admin.from("cron_jobs").insert({
    organization_id: organizationId,
    contact_id: contatoId,
    kind: "at",
    job_kind: "followup_turn",
    next_run_at: new Date(agora.getTime() + ESPERA_DA_OFERTA_DA_SEQUENCIA_MIN * 60_000).toISOString(),
    payload: {
      reason: motivoDaOfertaDaSequencia(comprado, alvo.produto),
      promise: null,
      promised_at: null,
      source: "sequencia_do_catalogo",
      produto: alvo.produto.nome,
    },
  });
  if (error) throw new Error(`oferta da sequência não agendada: ${error.message}`);
  return "agendada";
}
