/**
 * O fluxo que a campanha vai iniciar é DESTA organização, e aceita inscrição?
 *
 * As rotas de campanha escrevem com o cliente de serviço (o papel `authenticated`
 * só lê `campaigns`), e a chave estrangeira de `flow_pointer_id` garante apenas
 * que o fluxo EXISTE — não que é da empresa de quem pediu. Sem esta conferência,
 * um id de fluxo de outra empresa entraria na campanha.
 *
 * Roteiro de atendimento (`surface = 'atendimento'`) começa na conversa, não por
 * inscrição: recusar aqui, com a frase, evita uma campanha que falharia
 * destinatário por destinatário.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type FluxoParaCampanha =
  | { ok: true; nome: string; publicado: boolean }
  | { ok: false; motivo: "nao_encontrado" | "roteiro_de_atendimento" };

export async function fluxoParaCampanha(
  db: SupabaseClient,
  organizationId: string,
  pointerId: string,
): Promise<FluxoParaCampanha> {
  const { data, error } = await db
    .from("followup_flow_pointers")
    .select("id, name, status, active_version_id, surface")
    .eq("organization_id", organizationId)
    .eq("id", pointerId)
    .maybeSingle();
  if (error) throw new Error(`campanha: leitura do fluxo falhou: ${error.message}`);
  const f = data as { name: string; status: string; active_version_id: string | null; surface: string | null } | null;
  if (!f) return { ok: false, motivo: "nao_encontrado" };
  if (f.surface === "atendimento") return { ok: false, motivo: "roteiro_de_atendimento" };
  return { ok: true, nome: f.name, publicado: f.status === "active" && !!f.active_version_id };
}

export const FRASE_DO_FLUXO: Record<"nao_encontrado" | "roteiro_de_atendimento", string> = {
  nao_encontrado: "Escolha um fluxo desta organização.",
  roteiro_de_atendimento: "Este é um roteiro de atendimento: ele começa na conversa, não por campanha. Escolha um fluxo.",
};
