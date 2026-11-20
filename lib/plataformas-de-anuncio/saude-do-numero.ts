/**
 * Nota de saúde de um número (0–100), para o rodízio tirar carga ANTES de ele cair.
 *
 * Até aqui o rodízio só sabia "conectado ou caído": um número que caiu três vezes de manhã voltava
 * à tarde recebendo a mesma fatia de leads, e caía de novo (5230 em 17/11/2026: três quedas entre
 * 11h e 17h). As plataformas grandes (respond.io, SleekFlow, Wati) pesam a distribuição pela saúde.
 *
 * Quatro sinais, todos já gravados — nenhuma coluna nova:
 * - quedas nas últimas 72 h: avisos críticos de conexão na Central (`agent_inbox_items`), agrupados
 *   em episódios (aviso a menos de 30 min do anterior é a mesma queda: o monitor avisa FAILED e
 *   STOPPED do mesmo tombo);
 * - mensagens que não saem: `messages` de saída com `status='failed'` nas últimas 24 h;
 * - pico de envio por hora nas últimas 24 h (`pacing_ledger`): 16/11 caíram números a 90–160/h;
 * - leads que somem: conversa nova (2–72 h atrás) em que o lead escreveu uma vez só.
 *
 * Efeito no rodízio (`fatorDaNota`): nota < 30 descansa (sai da escolha enquanto houver outro com
 * vaga), 30–59 recebe metade do orçamento, 60+ recebe o orçamento inteiro. Descansar nunca perde
 * clique: todos cheios ou descansando, o clique vai para o menos carregado (transbordo).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { REF_KIND_SESSAO } from "@/lib/channels/health";
import { logger } from "@/lib/logger";

const HORA_MS = 3_600_000;

/** Aviso a menos disto do anterior é o mesmo episódio de queda. */
export const INTERVALO_DO_EPISODIO_MS = 30 * 60_000;
/** Ritmo que derrubou números em 16/11/2026 (90–160 msgs/h). */
export const PICO_ARRISCADO_POR_HORA = 100;
export const NOTA_DESCANSO = 30;
export const NOTA_METADE = 60;

export interface SinaisDeSaude {
  quedas72h: number;
  enviadas24h: number;
  falhas24h: number;
  picoPorHora24h: number;
  /** Conversas novas de 2–72 h atrás. */
  leads72h: number;
  /** Dessas, as em que o lead escreveu uma vez só. */
  leadsSumidos72h: number;
}

export interface SaudeDoNumero extends SinaisDeSaude {
  nota: number;
  /** Código da Meta que bloqueia o número (ex. "131031"), ou `null`. Bloqueado sai do rodízio. */
  bloqueio: string | null;
}

/**
 * Recusas da Meta que valem para TODO destinatário: o número não entrega a ninguém, então
 * mandar lead para ele é clique pago perdido (4871 em 19/11/2026: 42 cliques, 4 conversas).
 * 131031 conta bloqueada; 130497 país restrito; 368 bloqueio por política; 131042 pagamento.
 * Recusa por destinatário (131026, 131047…) não entra: o número segue bom para os outros.
 */
export const CODIGOS_DE_BLOQUEIO = new Set(["131031", "130497", "368", "131042"]);

/** Código da Meta de uma falha: a Cloud API grava em `error_code`; o parceiro, no começo da mensagem. */
export function codigoDaMeta(errorCode: string | null, errorMessage: string | null): string | null {
  if (errorCode && /^\d+$/.test(errorCode)) return errorCode;
  return errorMessage?.match(/^\s*(\d{3,6})\b/)?.[1] ?? null;
}

export interface EnvioRecente {
  status: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

/**
 * O número está bloqueado quando a última recusa de bloqueio é MAIS NOVA que o último envio que
 * saiu. Volta sozinho: um envio que passa depois da recusa (ou 24 h sem nova recusa) o devolve
 * ao rodízio — e, se ainda estiver bloqueado, a próxima recusa o tira de novo.
 */
export function bloqueioDoNumero(envios: readonly EnvioRecente[]): string | null {
  let ultimoBloqueio: { em: number; codigo: string } | null = null;
  let ultimoQueSaiu = -Infinity;
  for (const e of envios) {
    const em = Date.parse(e.created_at);
    if (e.status === "failed") {
      const codigo = codigoDaMeta(e.error_code, e.error_message);
      if (codigo && CODIGOS_DE_BLOQUEIO.has(codigo) && em > (ultimoBloqueio?.em ?? -Infinity)) ultimoBloqueio = { em, codigo };
    } else if (e.status === "sent" || e.status === "delivered" || e.status === "read") {
      ultimoQueSaiu = Math.max(ultimoQueSaiu, em);
    }
  }
  return ultimoBloqueio && ultimoBloqueio.em > ultimoQueSaiu ? ultimoBloqueio.codigo : null;
}

/**
 * As falhas que pesam na nota. Recusa de BLOQUEIO (conta, país, política, pagamento) com um envio que saiu
 * DEPOIS dela é episódio encerrado: o bloqueio já tirou e devolveu o número, e contar de novo o deixava pela
 * metade por 24 h — em 20/11/2026 o 7336 ficou com nota 57 por 92 recusas 131042 de um cartão já resolvido.
 * Recusa por destinatário (131026…) e falha sem código seguem contando.
 */
export function falhasQueContam(falhas: readonly EnvioRecente[], ultimoQueSaiu: number): number {
  let n = 0;
  for (const f of falhas) {
    const codigo = codigoDaMeta(f.error_code, f.error_message);
    if (codigo && CODIGOS_DE_BLOQUEIO.has(codigo) && Date.parse(f.created_at) < ultimoQueSaiu) continue;
    n += 1;
  }
  return n;
}

/** O último envio que saiu, em ms (ou -Infinity). */
export function ultimoEnvioQueSaiu(envios: readonly EnvioRecente[]): number {
  let ultimo = -Infinity;
  for (const e of envios) {
    if (e.status === "sent" || e.status === "delivered" || e.status === "read") ultimo = Math.max(ultimo, Date.parse(e.created_at));
  }
  return ultimo;
}

/** Quantos episódios de queda há numa lista de horários de aviso (qualquer ordem). */
export function contarEpisodios(horarios: readonly number[]): number {
  const ordenados = [...horarios].sort((a, b) => a - b);
  let episodios = 0;
  let ultimo = -Infinity;
  for (const t of ordenados) {
    if (t - ultimo > INTERVALO_DO_EPISODIO_MS) episodios += 1;
    ultimo = t;
  }
  return episodios;
}

/**
 * Os últimos envios que terminaram (saiu ou falhou) de CADA número, do mais novo para trás.
 * Consulta por número e ordenada: o PostgREST corta toda resposta em 1.000 linhas
 * (`PGRST_DB_MAX_ROWS`), e uma leitura única sem ordem das 24 h (2.157 envios em 19/11/2026)
 * perdia justamente as recusas mais novas — o 7336 recusado com 131042 seguiu no rodízio.
 */
async function enviosRecentes(
  admin: SupabaseClient,
  organizationId: string,
  ids: readonly string[],
  desde: string,
): Promise<Map<string, EnvioRecente[]>> {
  const saida = new Map<string, EnvioRecente[]>();
  await Promise.all(
    ids.map(async (id) => {
      const { data, error } = await admin
        .from("messages")
        .select("status, error_code, error_message, created_at")
        .eq("organization_id", organizationId)
        .eq("channel_session_id", id)
        .eq("direction", "outbound")
        .in("status", ["failed", "sent", "delivered", "read"])
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) logger.warn("[plataformas-de-anuncio.saude] envios recentes não lidos", { detalhe: error.message });
      saida.set(id, (data ?? []) as EnvioRecente[]);
    }),
  );
  return saida;
}

/** O maior número de envios numa mesma hora (horários em ISO). */
export function picoPorHora(horarios: readonly string[]): number {
  const porHora = new Map<number, number>();
  for (const h of horarios) {
    const balde = Math.floor(Date.parse(h) / HORA_MS);
    porHora.set(balde, (porHora.get(balde) ?? 0) + 1);
  }
  return Math.max(0, ...porHora.values());
}

interface Envios24h {
  enviadas: number;
  falhas: EnvioRecente[];
  /** Horários dos envios que NÓS iniciamos (`pacing_ledger.tipo = iniciada`). */
  iniciadas: string[];
}

/**
 * Os sinais de 24 h de CADA número, lidos um a um. A leitura única de todos cortava em 1.000 linhas
 * (`PGRST_DB_MAX_ROWS`) sem ordem — com 2.649 envios em 20/11/2026, a taxa de falha saía de uma amostra
 * qualquer. O total é contagem no banco; as falhas e as iniciadas são poucas.
 *
 * O PICO conta só o que NÓS iniciamos: responder a quem escreveu não é disparo em massa, e a retomada das
 * conversas depois de uma queda (123 balões numa hora, 20/11/2026) derrubava a nota do número que a fez.
 */
async function envios24hPorNumero(
  admin: SupabaseClient,
  organizationId: string,
  ids: readonly string[],
  desde: string,
): Promise<Map<string, Envios24h>> {
  const saida = new Map<string, Envios24h>();
  await Promise.all(
    ids.map(async (id) => {
      const [total, falhas, iniciadas] = await Promise.all([
        admin
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("channel_session_id", id)
          .eq("direction", "outbound")
          .gte("created_at", desde),
        admin
          .from("messages")
          .select("status, error_code, error_message, created_at")
          .eq("organization_id", organizationId)
          .eq("channel_session_id", id)
          .eq("direction", "outbound")
          .eq("status", "failed")
          .gte("created_at", desde)
          .order("created_at", { ascending: false })
          .limit(1000),
        admin
          .from("pacing_ledger")
          .select("sent_at")
          .eq("organization_id", organizationId)
          .eq("channel_session_id", id)
          .eq("tipo", "iniciada")
          .gte("sent_at", desde)
          .order("sent_at", { ascending: false })
          .limit(1000),
      ]);
      for (const [qual, erro] of [["envios de 24 h", total.error], ["falhas de 24 h", falhas.error], ["envios iniciados", iniciadas.error]] as const) {
        if (erro) logger.warn("[plataformas-de-anuncio.saude] sinal não lido", { qual, detalhe: erro.message });
      }
      saida.set(id, {
        enviadas: total.count ?? 0,
        falhas: (falhas.data ?? []) as EnvioRecente[],
        iniciadas: ((iniciadas.data ?? []) as { sent_at: string }[]).map((l) => l.sent_at),
      });
    }),
  );
  return saida;
}

/** A nota PURA. Amostra pequena não pune: taxa só conta com volume mínimo. */
export function notaDeSaude(s: SinaisDeSaude): number {
  let nota = 100;
  nota -= Math.min(75, s.quedas72h * 25);
  if (s.enviadas24h >= 20) {
    // 10% de falha já é sinal forte de bloqueio/restrição: perde os 30 pontos inteiros.
    nota -= Math.min(30, Math.round((s.falhas24h / s.enviadas24h) * 300));
  }
  if (s.picoPorHora24h >= PICO_ARRISCADO_POR_HORA) nota -= 20;
  if (s.leads72h >= 10) {
    const sumidos = s.leadsSumidos72h / s.leads72h;
    // Até 40% de "oi e sumiu" é normal em lead de anúncio; acima disso, até 15 pontos.
    if (sumidos > 0.4) nota -= Math.min(15, Math.round((sumidos - 0.4) * 50));
  }
  return Math.max(0, Math.min(100, nota));
}

/** Quanto do orçamento o número recebe com esta nota (0 = descansa). */
export function fatorDaNota(nota: number | null | undefined): number {
  if (nota == null) return 1;
  if (nota < NOTA_DESCANSO) return 0;
  if (nota < NOTA_METADE) return 0.5;
  return 1;
}

const SAUDAVEL: SinaisDeSaude = {
  quedas72h: 0,
  enviadas24h: 0,
  falhas24h: 0,
  picoPorHora24h: 0,
  leads72h: 0,
  leadsSumidos72h: 0,
};

/**
 * Sinais e nota por conexão (chave: id da sessão). Leitura que falha conta como "sem sinal" e é
 * LOGADA: nota inventada para baixo tiraria um número bom do rodízio por um soluço do banco.
 */
export async function saudeDosNumeros(
  admin: SupabaseClient,
  organizationId: string,
  sessionIds: readonly string[],
  agora: Date = new Date(),
): Promise<Map<string, SaudeDoNumero>> {
  const saida = new Map<string, SaudeDoNumero>();
  if (sessionIds.length === 0) return saida;
  const ids = [...sessionIds];
  const desde72h = new Date(agora.getTime() - 72 * HORA_MS).toISOString();
  const desde24h = new Date(agora.getTime() - 24 * HORA_MS).toISOString();
  const ate2h = new Date(agora.getTime() - 2 * HORA_MS).toISOString();

  const [avisos, conversas, porNumero] = await Promise.all([
    admin
      .from("agent_inbox_items")
      .select("ref_id, created_at")
      .eq("organization_id", organizationId)
      .eq("ref_kind", REF_KIND_SESSAO)
      .in("ref_id", ids)
      .in("kind", ["channel_number_alert", "qr_rescan"])
      .eq("severity", "critical")
      .gte("created_at", desde72h)
      .limit(2000),
    admin
      .from("conversations")
      .select("channel_session_id, created_at, last_inbound_at")
      .eq("organization_id", organizationId)
      .in("channel_session_id", ids)
      .eq("is_group", false)
      .gte("created_at", desde72h)
      .lte("created_at", ate2h)
      .not("last_inbound_at", "is", null)
      .limit(10_000),
    envios24hPorNumero(admin, organizationId, ids, desde24h),
  ]);
  for (const [qual, erro] of [
    ["avisos de queda", avisos.error],
    ["leads de 72 h", conversas.error],
  ] as const) {
    if (erro) logger.warn("[plataformas-de-anuncio.saude] sinal não lido", { qual, detalhe: erro.message });
  }

  const sinais = new Map<string, SinaisDeSaude>(ids.map((id) => [id, { ...SAUDAVEL }]));
  const horariosDeQueda = new Map<string, number[]>();
  for (const a of (avisos.data ?? []) as { ref_id: string; created_at: string }[]) {
    horariosDeQueda.set(a.ref_id, [...(horariosDeQueda.get(a.ref_id) ?? []), Date.parse(a.created_at)]);
  }
  for (const [id, horarios] of horariosDeQueda) {
    const s = sinais.get(id);
    if (s) s.quedas72h = contarEpisodios(horarios);
  }
  const enviosPorSessao = await enviosRecentes(admin, organizationId, ids, desde24h);
  for (const [id, n] of porNumero) {
    const s = sinais.get(id);
    if (!s) continue;
    s.enviadas24h = n.enviadas;
    s.falhas24h = falhasQueContam(n.falhas, ultimoEnvioQueSaiu(enviosPorSessao.get(id) ?? []));
    s.picoPorHora24h = picoPorHora(n.iniciadas);
  }
  for (const c of (conversas.data ?? []) as { channel_session_id: string; created_at: string; last_inbound_at: string }[]) {
    const s = sinais.get(c.channel_session_id);
    if (!s) continue;
    s.leads72h += 1;
    // shortcut: "escreveu uma vez só" = a última entrada a menos de 2 min da abertura (quem manda
    // "oi" duas vezes seguidas conta como sumido); trocar por contagem de mensagens se a nota errar.
    if (Date.parse(c.last_inbound_at) - Date.parse(c.created_at) < 2 * 60_000) s.leadsSumidos72h += 1;
  }

  for (const [id, s] of sinais) {
    saida.set(id, { ...s, nota: notaDeSaude(s), bloqueio: bloqueioDoNumero(enviosPorSessao.get(id) ?? []) });
  }
  return saida;
}
