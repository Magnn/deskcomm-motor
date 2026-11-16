/**
 * Rodízio de números na captura: o clique vai para um dos números da organização que estão
 * CONECTADOS e com agente publicado, sorteado. Vários números dividem os leads por igual, e um
 * número que cai sai do sorteio sozinho — sem ninguém trocar o número da landing.
 *
 * Opt-in pela página (`rodizio=1`): organização com um agente por produto em números diferentes
 * não pode ter o lead de uma oferta caindo no número da outra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { logger } from "@/lib/logger";

/** Sorteio uniforme; `null` quando não há número vivo. `aleatorio` injetável para o teste. */
export function sortearNumero(numeros: readonly string[], aleatorio: () => number = Math.random): string | null {
  if (numeros.length === 0) return null;
  return numeros[Math.min(numeros.length - 1, Math.floor(aleatorio() * numeros.length))] ?? null;
}

/** Telefones dos números vivos com agente publicado. Falha devolve `[]`: quem chama cai no número configurado. */
export async function numerosDoRodizio(admin: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data: agentes, error: erroAgentes } = await admin
    .from("ai_agents")
    .select("version:ai_agent_versions!ai_agents_published_version_id_fkey(channel_session_id, status)")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not("published_version_id", "is", null);
  if (erroAgentes) {
    logger.warn("[plataformas-de-anuncio.rodizio] leitura dos agentes falhou", { detalhe: erroAgentes.message });
    return [];
  }
  const sessoes = [
    ...new Set(
      (agentes ?? []).flatMap((a) => {
        const v = (a as { version: { channel_session_id: string | null; status: string } | null }).version;
        return v?.status === "published" && v.channel_session_id ? [v.channel_session_id] : [];
      }),
    ),
  ];
  if (sessoes.length === 0) return [];

  const { data: vivas, error: erroSessoes } = await admin
    .from("channel_sessions")
    .select("phone_number")
    .eq("organization_id", organizationId)
    .in("id", sessoes)
    .eq("status", STATUS_SAUDAVEL)
    .is("archived_at", null)
    .not("phone_number", "is", null);
  if (erroSessoes) {
    logger.warn("[plataformas-de-anuncio.rodizio] leitura dos números falhou", { detalhe: erroSessoes.message });
    return [];
  }
  return [...new Set((vivas ?? []).map((s) => String((s as { phone_number: string }).phone_number).replace(/\D/g, "")))].filter(
    (n) => n.length >= 10,
  );
}
