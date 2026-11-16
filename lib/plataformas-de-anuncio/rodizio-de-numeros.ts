/**
 * Rodízio de números na captura: o clique vai para o número CONECTADO e com agente publicado que
 * recebeu MENOS cliques nas últimas horas (empate sorteado). O sorteio puro deixava a divisão torta
 * em volume baixo (12 cliques em 16/11: 6, 5 e 1). Um número que cai sai do rodízio sozinho — sem
 * ninguém trocar o número da landing.
 *
 * Opt-in pela página (`rodizio=1`): organização com um agente por produto em números diferentes
 * não pode ter o lead de uma oferta caindo no número da outra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { logger } from "@/lib/logger";
import { numerosDoAgente, numerosExtrasPorAgente } from "@/lib/ai/agents/numeros-do-agente";

/** Sorteio uniforme; `null` quando não há número vivo. `aleatorio` injetável para o teste. */
export function sortearNumero(numeros: readonly string[], aleatorio: () => number = Math.random): string | null {
  if (numeros.length === 0) return null;
  return numeros[Math.min(numeros.length - 1, Math.floor(aleatorio() * numeros.length))] ?? null;
}

/** Janela da contagem: curta o bastante para um número recém-ligado não receber sozinho um dia inteiro de cliques. */
export const JANELA_DO_RODIZIO_MS = 6 * 60 * 60 * 1000;

/** O número com menos cliques na janela; empate vai para o sorteio. `null` quando não há número vivo. */
export function numeroComMenosCliques(
  numeros: readonly string[],
  cliques: ReadonlyMap<string, number>,
  aleatorio: () => number = Math.random,
): string | null {
  if (numeros.length === 0) return null;
  const menor = Math.min(...numeros.map((n) => cliques.get(n) ?? 0));
  return sortearNumero(numeros.filter((n) => (cliques.get(n) ?? 0) === menor), aleatorio);
}

/**
 * Cliques que o rodízio mandou para cada número desde `desde` (a rota grava o número em `query_raw.__numero`).
 * Falha devolve mapa vazio: todos empatam e o rodízio vira sorteio, nunca para.
 */
export async function cliquesPorNumero(admin: SupabaseClient, organizationId: string, desde: Date): Promise<Map<string, number>> {
  const { data, error } = await admin
    .from("meta_ads_click_refs")
    .select("numero:query_raw->>__numero")
    .eq("organization_id", organizationId)
    .gte("created_at", desde.toISOString())
    .not("query_raw->>__numero", "is", null)
    .limit(5000);
  const conta = new Map<string, number>();
  if (error) {
    logger.warn("[plataformas-de-anuncio.rodizio] contagem de cliques falhou", { detalhe: error.message });
    return conta;
  }
  for (const linha of (data ?? []) as { numero: string | null }[]) {
    if (linha.numero) conta.set(linha.numero, (conta.get(linha.numero) ?? 0) + 1);
  }
  return conta;
}

/** O número do próximo clique do rodízio, ou `null` sem número vivo (a rota usa o configurado). */
export async function proximoNumeroDoRodizio(admin: SupabaseClient, organizationId: string): Promise<string | null> {
  const numeros = await numerosDoRodizio(admin, organizationId);
  if (numeros.length <= 1) return numeros[0] ?? null;
  return numeroComMenosCliques(numeros, await cliquesPorNumero(admin, organizationId, new Date(Date.now() - JANELA_DO_RODIZIO_MS)));
}

interface VersaoPublicada {
  channel_session_id: string | null;
  status: string;
}

/** Telefones dos números vivos com agente publicado. Falha devolve `[]`: quem chama cai no número configurado. */
export async function numerosDoRodizio(admin: SupabaseClient, organizationId: string): Promise<string[]> {
  const { data: agentes, error: erroAgentes } = await admin
    .from("ai_agents")
    .select("id, version:ai_agent_versions!ai_agents_published_version_id_fkey(channel_session_id, status)")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .not("published_version_id", "is", null);
  if (erroAgentes) {
    logger.warn("[plataformas-de-anuncio.rodizio] leitura dos agentes falhou", { detalhe: erroAgentes.message });
    return [];
  }
  let extras = new Map<string, string[]>();
  try {
    extras = await numerosExtrasPorAgente(admin, [organizationId]);
  } catch (err) {
    logger.warn("[plataformas-de-anuncio.rodizio] números extras não lidos", { detalhe: err instanceof Error ? err.message : String(err) });
  }
  const sessoes = [
    ...new Set(
      (agentes ?? []).flatMap((a) => {
        // O PostgREST tipa o embed como lista mesmo sendo FK para uma linha só.
        const linha = a as unknown as { id: string; version: VersaoPublicada | VersaoPublicada[] | null };
        const v = Array.isArray(linha.version) ? linha.version[0] : linha.version;
        return v?.status === "published" ? numerosDoAgente(v.channel_session_id, extras.get(linha.id)) : [];
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
