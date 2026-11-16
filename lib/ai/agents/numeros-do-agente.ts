/**
 * Os números que um agente atende: o PRINCIPAL (o da versão publicada, `ai_agent_versions.channel_session_id`)
 * e os EXTRAS (`ai_agent_numeros`, migration 0962), que valem na hora, sem publicar versão.
 *
 * Toda pergunta "quem atende este número?" passa por aqui. Antes da 0962 cada consulta comparava só o
 * principal; um agente em três números exigia três cópias, e o roteiro mudado numa não mudava nas outras.
 *
 * Desempate: quem tem o número como PRINCIPAL vem antes de quem o tem como extra — use
 * `sqlOrdemDoNumero` no `order by`, antes da prioridade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Predicado SQL: o agente `agente` (alias de `ai_agents`) tem `sessao` como número EXTRA.
 * `agente` e `sessao` são trechos de SQL escritos no código (alias e parâmetro), nunca entrada de fora.
 */
export function sqlNumeroExtra(agente: string, sessao: string): string {
  return `exists (select 1 from ai_agent_numeros an where an.organization_id = ${agente}.organization_id and an.agent_id = ${agente}.id and an.channel_session_id = ${sessao})`;
}

/** Predicado SQL: o agente atende `sessao`, como principal (`versao.channel_session_id`) ou como extra. */
export function sqlAtendeNumero(agente: string, versao: string, sessao: string): string {
  return `(${versao}.channel_session_id = ${sessao} or ${sqlNumeroExtra(agente, sessao)})`;
}

/** Trecho de `order by`: o dono principal do número antes de quem o tem como extra. */
export function sqlOrdemDoNumero(versao: string, sessao: string): string {
  return `(${versao}.channel_session_id is not distinct from ${sessao}) desc`;
}

/** Os números extras de cada agente das organizações. Falha lança: quem chama decide se degrada. */
export async function numerosExtrasPorAgente(
  admin: SupabaseClient,
  organizationIds: readonly string[],
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (organizationIds.length === 0) return mapa;
  const { data, error } = await admin
    .from("ai_agent_numeros")
    .select("agent_id, channel_session_id")
    .in("organization_id", [...organizationIds]);
  if (error) throw new Error(`ai_agent_numeros: ${error.message}`);
  for (const linha of (data ?? []) as Array<{ agent_id: string; channel_session_id: string }>) {
    mapa.set(linha.agent_id, [...(mapa.get(linha.agent_id) ?? []), linha.channel_session_id]);
  }
  return mapa;
}

/** Todos os números de um agente: o principal (se houver) mais os extras, sem repetir. */
export function numerosDoAgente(principal: string | null | undefined, extras: readonly string[] | undefined): string[] {
  return [...new Set([...(principal ? [principal] : []), ...(extras ?? [])])];
}
