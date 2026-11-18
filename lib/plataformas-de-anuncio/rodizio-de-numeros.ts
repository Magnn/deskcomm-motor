/**
 * Rodízio de números na captura, POR CAPACIDADE (migration 0963).
 *
 * O clique vai para o número CONECTADO e com agente publicado que está mais LONGE do seu orçamento de
 * leads novos de hoje (`channel_knobs.lead_daily_caps`, em degraus por idade do número). A carga é o
 * que importa para o WhatsApp: conversas que COMEÇARAM hoje no número (o lead escreveu) mais os cliques
 * que acabaram de ser mandados para lá e ainda não escreveram (`JANELA_DE_CHEGADA_MS`).
 *
 * A versão anterior contava cliques das últimas 6 horas e dividia por igual: um número de 1 dia recebia
 * o mesmo que um de 1 mês, e clique que não virava conversa pesava igual a lead. Três números caíram
 * assim em 16/11/2026.
 *
 * Número cheio sai da escolha. Todos cheios: o clique vai para o MENOS carregado e a rota marca o
 * transbordo (`__transbordo`) — clique pago nunca se perde, e o excesso fica visível e logado.
 * Número sem orçamento nunca enche: entra na proporção pelo maior orçamento entre os outros (ou 1, se
 * nenhum tem orçamento — e aí o rodízio volta a dividir por igual, como antes).
 *
 * Desde 18/11/2026: número OFICIAL com vaga recebe antes dos de QR (que viram reserva), e a nota de
 * saúde (`saude-do-numero.ts`) corta o orçamento de quem está prestes a cair.
 *
 * Opt-in pela página (`rodizio=1`): organização com um agente por produto em números diferentes
 * não pode ter o lead de uma oferta caindo no número da outra.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { JANELA_DE_CHEGADA_MS } from "@/lib/agent-engine/pacing/defaults";
import { dayStartInTz, warmupCapFor } from "@/lib/agent-engine/pacing/engine";
import { fusoDaJanela, parseWarmupCaps } from "@/lib/agent-engine/pacing/store";
import { STATUS_SAUDAVEL } from "@/lib/channels/health";
import { logger } from "@/lib/logger";
import { numerosDoAgente, numerosExtrasPorAgente } from "@/lib/ai/agents/numeros-do-agente";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";

import { fatorDaNota, saudeDosNumeros } from "./saude-do-numero";

const DAY_MS = 86_400_000;

/** Sorteio uniforme; `null` quando não há número vivo. `aleatorio` injetável para o teste. */
export function sortearNumero(numeros: readonly string[], aleatorio: () => number = Math.random): string | null {
  if (numeros.length === 0) return null;
  return numeros[Math.min(numeros.length - 1, Math.floor(aleatorio() * numeros.length))] ?? null;
}

/** Um número no rodízio, com o que a escolha precisa saber dele hoje. */
export interface NumeroNoRodizio {
  telefone: string;
  /** Conversas que começaram hoje (dia local) neste número com o lead tendo escrito. */
  leadsHoje: number;
  /** Cliques mandados para cá nos últimos `JANELA_DE_CHEGADA_MS` que ainda não viraram conversa. */
  aCaminho: number;
  /** Orçamento de leads novos de hoje. `null` = sem orçamento (nunca enche). */
  orcamentoHoje: number | null;
  /** Número oficial (Cloud API): recebe primeiro; os de QR são reserva. */
  oficial?: boolean;
  /** Nota de saúde 0–100 (`saude-do-numero.ts`). Ausente = saudável. */
  nota?: number | null;
}

export interface EscolhaDoRodizio {
  telefone: string;
  /** Todos os números estavam cheios: este é o menos carregado, acima do orçamento. */
  transbordo: boolean;
}

/**
 * A escolha PURA, em três passos:
 * 1. Vaga = carga abaixo do orçamento × `fatorDaNota` (nota < 30 descansa; 30–59 vale metade).
 * 2. Entre os com vaga, os OFICIAIS primeiro: conversa que o lead começa não gasta limite da Meta e o
 *    risco de queda é bem menor; os de QR só recebem quando o oficial enche ou descansa.
 * 3. A menor fração do orçamento usada; empate sorteado. Ninguém com vaga: a menor fração entre
 *    todos (pelo orçamento cheio, sem a nota), marcada como transbordo — clique pago nunca se perde.
 */
export function escolherPorCapacidade(
  numeros: readonly NumeroNoRodizio[],
  aleatorio: () => number = Math.random,
): EscolhaDoRodizio | null {
  if (numeros.length === 0) return null;
  const finitos = numeros.map((n) => n.orcamentoHoje).filter((o): o is number => o !== null);
  // Sem orçamento entra na proporção pelo maior orçamento dos outros: divide com eles sem "furar a fila".
  const referencia = finitos.length > 0 ? Math.max(...finitos) : 1;
  const carga = (n: NumeroNoRodizio) => n.leadsHoje + n.aCaminho;
  const capacidade = (n: NumeroNoRodizio) => (n.orcamentoHoje ?? referencia) * fatorDaNota(n.nota);
  const temVaga = (n: NumeroNoRodizio) =>
    fatorDaNota(n.nota) > 0 && (n.orcamentoHoje === null || carga(n) < capacidade(n));

  const comVaga = numeros.filter(temVaga);
  const oficiaisComVaga = comVaga.filter((n) => n.oficial);
  const universo = oficiaisComVaga.length > 0 ? oficiaisComVaga : comVaga.length > 0 ? comVaga : numeros;
  const fracao =
    comVaga.length > 0
      ? (n: NumeroNoRodizio) => carga(n) / Math.max(1, capacidade(n))
      : (n: NumeroNoRodizio) => carga(n) / Math.max(1, n.orcamentoHoje ?? referencia);
  const menor = Math.min(...universo.map(fracao));
  // Comparação com folga: frações iguais vindas de divisões diferentes não podem desempatar por arredondamento.
  const empatados = universo.filter((n) => fracao(n) - menor < 1e-9).map((n) => n.telefone);
  const telefone = sortearNumero(empatados, aleatorio);
  return telefone ? { telefone, transbordo: comVaga.length === 0 } : null;
}

interface VersaoPublicada {
  channel_session_id: string | null;
  status: string;
}

/** Uma conexão viva do rodízio: o id da sessão e o telefone só com dígitos. */
export interface SessaoDoRodizio {
  sessionId: string;
  telefone: string;
  /** Cloud API (número oficial). */
  oficial?: boolean;
}

function soDigitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/** Conexões vivas com agente publicado. Falha devolve `[]`: quem chama cai no número configurado. */
export async function sessoesDoRodizio(admin: SupabaseClient, organizationId: string): Promise<SessaoDoRodizio[]> {
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
    .select("id, phone_number, provider")
    .eq("organization_id", organizationId)
    .in("id", sessoes)
    .eq("status", STATUS_SAUDAVEL)
    .is("archived_at", null)
    .not("phone_number", "is", null);
  if (erroSessoes) {
    logger.warn("[plataformas-de-anuncio.rodizio] leitura dos números falhou", { detalhe: erroSessoes.message });
    return [];
  }
  const vistos = new Set<string>();
  const saida: SessaoDoRodizio[] = [];
  for (const s of (vivas ?? []) as { id: string; phone_number: string; provider: string | null }[]) {
    const telefone = soDigitos(String(s.phone_number));
    // Dois registros do mesmo telefone contam como um número: o WhatsApp vê um só.
    if (telefone.length < 10 || vistos.has(telefone)) continue;
    vistos.add(telefone);
    saida.push({ sessionId: s.id, telefone, oficial: s.provider === CHANNEL_PROVIDER_META });
  }
  return saida;
}

/** Telefones dos números vivos com agente publicado (a área do cliente sorteia entre eles). */
export async function numerosDoRodizio(admin: SupabaseClient, organizationId: string): Promise<string[]> {
  return (await sessoesDoRodizio(admin, organizationId)).map((s) => s.telefone);
}

/** O que o rodízio sabe de cada conexão hoje — também é o que a tela de Proteção de envio mostra. */
export interface CargaDoNumero {
  leadsHoje: number;
  aCaminho: number;
  orcamentoHoje: number | null;
}

/**
 * Carga e orçamento de hoje por conexão (chave: `sessionId`). O dia é o LOCAL do número
 * (`fusoDaJanela`: o do número, senão o da organização), o mesmo dia do aquecimento.
 *
 * Falha de leitura vira zero e é LOGADA: o rodízio não pode parar de mandar cliques porque uma
 * contagem falhou — dividir sem a carga é o comportamento antigo, não um clique perdido.
 */
export async function cargaDosNumeros(
  admin: SupabaseClient,
  organizationId: string,
  sessoes: readonly SessaoDoRodizio[],
  agora: Date = new Date(),
): Promise<Map<string, CargaDoNumero>> {
  const carga = new Map<string, CargaDoNumero>();
  if (sessoes.length === 0) return carga;
  const ids = sessoes.map((s) => s.sessionId);

  const [knobs, org] = await Promise.all([
    admin
      .from("channel_knobs")
      .select("channel_session_id, lead_daily_caps, number_activated_at, timezone")
      .eq("organization_id", organizationId)
      .in("channel_session_id", ids),
    admin.from("organizations").select("timezone").eq("id", organizationId).maybeSingle(),
  ]);
  if (knobs.error) {
    logger.warn("[plataformas-de-anuncio.rodizio] orçamentos não lidos", { detalhe: knobs.error.message });
  }
  const fusoDaOrg = (org.data as { timezone?: string | null } | null)?.timezone ?? null;
  const knobsPorSessao = new Map(
    ((knobs.data ?? []) as {
      channel_session_id: string;
      lead_daily_caps: unknown;
      number_activated_at: string | null;
      timezone: string | null;
    }[]).map((k) => [k.channel_session_id, k]),
  );

  const inicioDoDia = new Map<string, Date>();
  for (const s of sessoes) {
    const k = knobsPorSessao.get(s.sessionId);
    inicioDoDia.set(s.sessionId, dayStartInTz(agora, fusoDaJanela(k?.timezone, fusoDaOrg)));
    const caps = parseWarmupCaps(k?.lead_daily_caps);
    const ativado = k?.number_activated_at ? Date.parse(k.number_activated_at) : NaN;
    const idade = Number.isFinite(ativado) ? Math.max(0, Math.floor((agora.getTime() - ativado) / DAY_MS)) : 0;
    carga.set(s.sessionId, { leadsHoje: 0, aCaminho: 0, orcamentoHoje: caps ? warmupCapFor(idade, caps) : null });
  }

  // Uma consulta desde o começo de dia MAIS ANTIGO entre os fusos; cada número filtra o seu.
  const desde = new Date(Math.min(...[...inicioDoDia.values()].map((d) => d.getTime())));
  const conversas = await admin
    .from("conversations")
    .select("channel_session_id, created_at")
    .eq("organization_id", organizationId)
    .in("channel_session_id", ids)
    .gte("created_at", desde.toISOString())
    .eq("is_group", false)
    .not("last_inbound_at", "is", null)
    .limit(10_000);
  if (conversas.error) {
    logger.warn("[plataformas-de-anuncio.rodizio] leads de hoje não contados", { detalhe: conversas.error.message });
  }
  for (const c of (conversas.data ?? []) as { channel_session_id: string; created_at: string }[]) {
    const item = carga.get(c.channel_session_id);
    const inicio = inicioDoDia.get(c.channel_session_id);
    if (item && inicio && Date.parse(c.created_at) >= inicio.getTime()) item.leadsHoje += 1;
  }

  const sessaoPorTelefone = new Map(sessoes.map((s) => [s.telefone, s.sessionId]));
  const cliques = await admin
    .from("meta_ads_click_refs")
    .select("numero:query_raw->>__numero")
    .eq("organization_id", organizationId)
    .gte("created_at", new Date(agora.getTime() - JANELA_DE_CHEGADA_MS).toISOString())
    .is("matched_at", null)
    .not("query_raw->>__numero", "is", null)
    .limit(5000);
  if (cliques.error) {
    logger.warn("[plataformas-de-anuncio.rodizio] cliques a caminho não contados", { detalhe: cliques.error.message });
  }
  for (const linha of (cliques.data ?? []) as { numero: string | null }[]) {
    const sessionId = linha.numero ? sessaoPorTelefone.get(soDigitos(linha.numero)) : undefined;
    const item = sessionId ? carga.get(sessionId) : undefined;
    if (item) item.aCaminho += 1;
  }
  return carga;
}

/**
 * O número do próximo clique do rodízio, ou `null` sem número vivo (a rota usa o configurado).
 * Transbordo é logado como aviso: é o sinal de que os números precisam de mais orçamento (ou de
 * mais um número) para o volume de anúncio que está entrando.
 */
export async function proximoNumeroDoRodizio(
  admin: SupabaseClient,
  organizationId: string,
  agora: Date = new Date(),
): Promise<EscolhaDoRodizio | null> {
  const sessoes = await sessoesDoRodizio(admin, organizationId);
  if (sessoes.length === 0) return null;
  const [carga, saude] = await Promise.all([
    cargaDosNumeros(admin, organizationId, sessoes, agora),
    // A nota nunca derruba o clique: sem ela, todo número conta como saudável (o rodízio de antes).
    saudeDosNumeros(admin, organizationId, sessoes.map((s) => s.sessionId), agora).catch((err: unknown) => {
      logger.warn("[plataformas-de-anuncio.rodizio] nota de saúde não calculada", {
        detalhe: err instanceof Error ? err.message : String(err),
      });
      return new Map<string, { nota: number }>();
    }),
  ]);
  const escolha = escolherPorCapacidade(
    sessoes.map((s) => ({
      telefone: s.telefone,
      oficial: s.oficial ?? false,
      nota: saude.get(s.sessionId)?.nota ?? null,
      ...(carga.get(s.sessionId) ?? { leadsHoje: 0, aCaminho: 0, orcamentoHoje: null }),
    })),
  );
  if (escolha?.transbordo) {
    logger.warn("[plataformas-de-anuncio.rodizio] todos os números cheios ou descansando — clique em transbordo", {
      organizationId,
      numeros: sessoes.length,
      carga: Object.fromEntries(
        [...carga].map(([id, c]) => [id, `${c.leadsHoje}+${c.aCaminho}/${c.orcamentoHoje ?? "∞"} nota ${saude.get(id)?.nota ?? "?"}`]),
      ),
    });
  }
  return escolha;
}
