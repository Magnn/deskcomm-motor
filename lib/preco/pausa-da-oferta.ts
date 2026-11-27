/**
 * A PAUSA DA OFERTA NA CONVERSA — o único relógio da venda dentro do turno. Decisão do dono, 27/11/2026: a oferta
 * sai sempre que o assunto encaixar; só dá um tempo quando a pessoa recusa ou diz que está sem dinheiro, e na volta
 * vem o passo menor (mais barato ou entrada). É a mesma régua da oferta proativa (`pausaDaOferta`). Pura.
 */
import { RECUSA_PADRAO, SEM_DINHEIRO_PADRAO } from "@/lib/oferta-proativa/config";
import { ehRecusaDaOferta } from "@/lib/opt-out/deteccao";

/** shortcut: fixo no turno; a oferta proativa lê `pausa_apos_recusa_horas` da configuração. Ligar à config quando outra org pedir outro tempo. */
export const PAUSA_NA_CONVERSA_HORAS = 12;

export interface FalaDatada {
  direction: string;
  body?: string | null;
  sent_at?: string | null;
}

const RE_RECUSA = new RegExp(RECUSA_PADRAO, "i");
const RE_SEM_DINHEIRO = new RegExp(SEM_DINHEIRO_PADRAO, "i");

/** A fala é um não à oferta ou um "sem dinheiro". */
export function ehNaoOuSemDinheiro(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return RE_RECUSA.test(texto) || RE_SEM_DINHEIRO.test(texto) || ehRecusaDaOferta(texto);
}

/** Ela disse que está sem dinheiro nesta fala. */
export const ehSemDinheiro = (texto: string | null | undefined): boolean => !!texto && RE_SEM_DINHEIRO.test(texto);

/**
 * Ela disse não ou "sem dinheiro" nas últimas `PAUSA_NA_CONVERSA_HORAS`? Fala sem hora conta como agora: na dúvida,
 * dá o tempo.
 */
export function emPausaDaOferta(mensagens: readonly FalaDatada[], agora: Date = new Date()): boolean {
  const desde = agora.getTime() - PAUSA_NA_CONVERSA_HORAS * 3_600_000;
  return mensagens.some(
    (m) =>
      m.direction === "inbound" &&
      ehNaoOuSemDinheiro(m.body) &&
      (!m.sent_at || Number.isNaN(Date.parse(m.sent_at)) || Date.parse(m.sent_at) >= desde),
  );
}
