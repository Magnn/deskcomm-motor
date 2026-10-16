/**
 * COEXISTÊNCIA: o pedido da agenda e do histórico do celular, com o desfecho
 * guardado no próprio número (`channel_sessions.metadata.coexistencia`).
 *
 * Por que existe: até 16/10/2026 os dois pedidos saíam UMA vez, no mesmo
 * segundo da conexão, e o desfecho só ia ao log. Medido em produção naquele
 * dia: os dois voltaram `(#133010) Account not registered` — o número ainda
 * não estava ativo na Cloud API no instante do pedido — e não havia como
 * pedir de novo sem desconectar pelo celular e refazer a janela. A Meta aceita
 * cada pedido uma vez e só nas 24 h seguintes à conexão; recusa não conta como
 * pedido feito, então tentar de novo dentro do prazo é o conserto.
 *
 * Duas camadas: na conexão, uma espera curta quando a recusa é "ainda não
 * registrado" (`ESPERAS_MS`); depois, o botão "Pedir de novo" da aba API
 * Oficial (`POST /api/v1/channels/official/celular`). O que já deu certo não
 * é pedido outra vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  pedirAgendaDoAplicativo,
  pedirHistoricoDoAplicativo,
} from "@/lib/channels/meta/cadastro-incorporado";

export type DesfechoDoPedido = "pedido" | "ja_pedido" | "falhou";

export interface EstadoDoCelular {
  agenda: DesfechoDoPedido;
  historico: DesfechoDoPedido;
  /** Motivo da Meta na última recusa; `null` quando os dois foram aceitos. */
  motivo: string | null;
  /** Quando esta tentativa terminou (ISO). */
  em: string;
  /** Quando o número foi conectado — de onde contam as 24 h da Meta. */
  conectadoEm: string | null;
}

/** As 24 h que a Meta dá para os dois pedidos, contadas da conexão. */
export const PRAZO_DA_META_MS = 24 * 60 * 60 * 1000;

/** Espera entre tentativas quando o número ainda não está ativo na Cloud API. */
export const ESPERAS_MS = [4_000, 8_000] as const;

/** `#133010`: o número ainda não terminou de entrar na Cloud API. Passageiro logo após a conexão. */
export function recusaDeNumeroAindaNaoAtivo(motivo: string | null | undefined): boolean {
  return typeof motivo === "string" && /133010|not registered/i.test(motivo);
}

const DESFECHOS: ReadonlySet<string> = new Set(["pedido", "ja_pedido", "falhou"]);

/** Lê `metadata.coexistencia`; qualquer forma estranha vale como "nunca pedido". */
export function lerEstadoDoCelular(metadata: unknown): EstadoDoCelular | null {
  if (!metadata || typeof metadata !== "object") return null;
  const bruto = (metadata as Record<string, unknown>).coexistencia;
  if (!bruto || typeof bruto !== "object") return null;
  const c = bruto as Record<string, unknown>;
  if (typeof c.agenda !== "string" || !DESFECHOS.has(c.agenda)) return null;
  if (typeof c.historico !== "string" || !DESFECHOS.has(c.historico)) return null;
  return {
    agenda: c.agenda as DesfechoDoPedido,
    historico: c.historico as DesfechoDoPedido,
    motivo: typeof c.motivo === "string" ? c.motivo : null,
    em: typeof c.em === "string" ? c.em : "",
    conectadoEm: typeof c.conectadoEm === "string" ? c.conectadoEm : null,
  };
}

/** Devolve o `metadata` com o estado novo, preservando as outras chaves. */
export function comEstadoDoCelular(metadata: unknown, estado: EstadoDoCelular): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
  return { ...base, coexistencia: estado };
}

/** Ainda há o que pedir: algum dos dois não foi aceito. */
export function faltaPedir(estado: EstadoDoCelular | null): boolean {
  return !estado || estado.agenda === "falhou" || estado.historico === "falhou";
}

/** O prazo da Meta já passou? Sem a hora da conexão, quem decide é a Meta. */
export function prazoVencido(estado: EstadoDoCelular | null, agora: Date = new Date()): boolean {
  if (!estado?.conectadoEm) return false;
  const t = Date.parse(estado.conectadoEm);
  return Number.isFinite(t) && agora.getTime() - t > PRAZO_DA_META_MS;
}

type Pedir = typeof pedirAgendaDoAplicativo;

async function pedirComEspera(
  pedir: Pedir,
  p: { phoneNumberId: string; token: string },
  esperar: (ms: number) => Promise<void>,
  esperas: readonly number[],
): Promise<{ desfecho: DesfechoDoPedido; motivo: string | null }> {
  let r = await pedir(p);
  for (const ms of esperas) {
    if (r.ok || !recusaDeNumeroAindaNaoAtivo(r.motivo)) break;
    await esperar(ms);
    r = await pedir(p);
  }
  if (r.ok) return { desfecho: r.jaPedida ? "ja_pedido" : "pedido", motivo: null };
  return { desfecho: "falhou", motivo: r.motivo };
}

const dormir = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Pede a agenda e depois o histórico (a Meta pede nessa ordem), pulando o que
 * já foi aceito em `anterior`. Nunca lança: o desfecho é um estado.
 */
export async function sincronizarCelular(
  p: { phoneNumberId: string; token: string },
  opcoes: {
    anterior?: EstadoDoCelular | null;
    conectadoEm?: string | null;
    esperar?: (ms: number) => Promise<void>;
    esperas?: readonly number[];
    pedirAgenda?: Pedir;
    pedirHistorico?: Pedir;
    agora?: () => Date;
  } = {},
): Promise<EstadoDoCelular> {
  const esperar = opcoes.esperar ?? dormir;
  const esperas = opcoes.esperas ?? ESPERAS_MS;
  const pedirAgenda = opcoes.pedirAgenda ?? ((x) => pedirAgendaDoAplicativo(x));
  const pedirHistorico = opcoes.pedirHistorico ?? ((x) => pedirHistoricoDoAplicativo(x));
  const anterior = opcoes.anterior ?? null;

  let motivo: string | null = null;
  let agenda: DesfechoDoPedido;
  if (anterior && anterior.agenda !== "falhou") {
    agenda = anterior.agenda;
  } else {
    const r = await pedirComEspera(pedirAgenda, p, esperar, esperas);
    agenda = r.desfecho;
    motivo = r.motivo;
  }

  let historico: DesfechoDoPedido;
  if (anterior && anterior.historico !== "falhou") {
    historico = anterior.historico;
  } else {
    const r = await pedirComEspera(pedirHistorico, p, esperar, esperas);
    historico = r.desfecho;
    motivo = r.motivo ?? motivo;
  }

  return {
    agenda,
    historico,
    motivo,
    em: (opcoes.agora?.() ?? new Date()).toISOString(),
    conectadoEm: opcoes.conectadoEm ?? anterior?.conectadoEm ?? null,
  };
}

/**
 * Grava o estado em `metadata.coexistencia` sem apagar as outras chaves do
 * número (fluxo, atendimento, pré-go-live). Falha de escrita não desfaz a
 * conexão: só some o aviso na tela.
 */
export async function guardarEstadoDoCelular(
  admin: SupabaseClient,
  organizationId: string,
  channelSessionId: string,
  estado: EstadoDoCelular,
): Promise<boolean> {
  const { data } = await admin
    .from("channel_sessions")
    .select("metadata")
    .eq("id", channelSessionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  const atual = (data as { metadata?: unknown } | null)?.metadata ?? null;
  const { error } = await admin
    .from("channel_sessions")
    .update({ metadata: comEstadoDoCelular(atual, estado) })
    .eq("id", channelSessionId)
    .eq("organization_id", organizationId);
  return !error;
}
