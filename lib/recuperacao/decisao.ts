/**
 * RECUPERAÇÃO DE SILÊNCIO — as duas decisões, puras (sem banco, sem relógio próprio).
 */
import type { Recuperacao } from "./config";

const MIN = 60_000;
const HORA = 60 * MIN;
/** Folga antes do fechamento: mensagem enfileirada com menos que isso arrisca sair com o prazo vencido. */
export const FOLGA_DO_FECHAMENTO_MS = 5 * MIN;
/** Quanto à frente a decisão olha para saber se a faixa de envio está prestes a fechar. */
const OLHAR_A_FRENTE_MS = 10 * MIN;

export interface SilencioDaConversa {
  /** Quando o agente falou por último ANTES de começar a recuperar (o início do silêncio). */
  silencioDesde: Date;
  /** Chamadas de recuperação já feitas neste silêncio. */
  feitas: number;
  /** Quando saiu a última chamada; `null` se nenhuma. */
  ultimaEm: Date | null;
}

/**
 * Qual chamada fazer agora. Devolve o NÚMERO do passo (1 = primeiro) ou `null`.
 *
 * Uma por vez, mesmo com atraso: se o worker ficou fora e dois passos venceram juntos, sai só o próximo,
 * e o seguinte espera o intervalo que a configuração previa entre os dois. Sem isso a pessoa receberia
 * duas cobranças no mesmo minuto.
 */
export function decidirPasso(r: Recuperacao, s: SilencioDaConversa, agora: Date): number | null {
  const proximo = s.feitas;
  const minutos = r.steps_minutes[proximo];
  if (minutos === undefined) return null;
  if (agora.getTime() - s.silencioDesde.getTime() < minutos * MIN) return null;
  if (s.ultimaEm !== null) {
    const intervalo = (minutos - (r.steps_minutes[proximo - 1] ?? 0)) * MIN;
    if (agora.getTime() - s.ultimaEm.getTime() < intervalo) return null;
  }
  return proximo + 1;
}

export interface JanelaComRetorno {
  /** Quando o prazo de conversa livre do canal acaba (última mensagem do cliente + 24 h). */
  fechaEm: Date;
  /** Para quando o cliente combinou o retorno. */
  retornoEm: Date;
  /** Já saiu a mensagem de manter aberta neste prazo? */
  jaEnviada: boolean;
}

/**
 * Mandar agora a mensagem que mantém a conversa aberta?
 *
 * `proximaAbertura(instante)` é a faixa de horário própria do follow-up: `null` = pode enviar naquele
 * instante; uma data = só a partir dela. Quando as últimas horas do prazo caem inteiras fora da faixa
 * (prazo que fecha de madrugada), a mensagem sai no ÚLTIMO momento em que a faixa ainda está aberta —
 * esperar o horário "certo" seria perder a conversa.
 */
export function decidirManterJanela(
  r: Recuperacao,
  j: JanelaComRetorno,
  agora: Date,
  proximaAbertura: (instante: Date) => Date | null,
): boolean {
  if (!r.keep_window.enabled || j.jaEnviada) return false;
  const limite = j.fechaEm.getTime() - FOLGA_DO_FECHAMENTO_MS;
  if (agora.getTime() >= limite) return false;
  // Retorno dentro do prazo: o próprio retorno agendado fala com a pessoa a tempo.
  if (j.retornoEm.getTime() <= j.fechaEm.getTime()) return false;
  if (proximaAbertura(agora) !== null) return false;

  const alvo = j.fechaEm.getTime() - r.keep_window.hours_before_close * HORA;
  if (agora.getTime() >= alvo) return true;

  // Ainda cedo. Só antecipa se a faixa está para fechar e não reabre antes de o prazo vencer.
  const reabre = proximaAbertura(new Date(agora.getTime() + OLHAR_A_FRENTE_MS));
  return reabre !== null && reabre.getTime() >= limite;
}

function duracao(ms: number): string {
  const min = Math.max(1, Math.round(ms / MIN));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h === 1 ? "1 hora" : `${h} horas`;
}

/** O que o agente lê ao ser acordado para uma chamada de recuperação. */
export function motivoDoPasso(passo: number, total: number, silencioMs: number): string {
  return (
    `recuperação de silêncio, chamada ${passo} de ${total}: o cliente não respondeu à sua última mensagem há ` +
    `${duracao(silencioMs)}. Retome de onde a conversa parou com UMA mensagem curta e natural, ligada ao último ` +
    "assunto, que seja fácil de responder. Não repita o que já disse, não pressione e não invente urgência nem " +
    "novidade. Termine com uma linha curta avisando que, se a pessoa não quiser mais receber mensagens, basta " +
    "responder SAIR (SALIR se a conversa for em espanhol). Se a conversa já tinha terminado, ou se o cliente " +
    "pediu para não ser procurado, não envie nada"
  );
}

/** O que o agente lê ao ser acordado para manter a conversa aberta até a data combinada. */
export function motivoDeManterJanela(retornoEm: Date, restanteMs: number): string {
  return (
    `manter a conversa aberta: o cliente combinou retorno para ${retornoEm.toISOString()}, e este canal só permite ` +
    `mensagem livre por 24 horas depois da última mensagem dele — faltam cerca de ${duracao(restanteMs)}. Mande UMA ` +
    "mensagem curta que peça uma resposta simples (por exemplo, confirmar que o combinado continua de pé), para a " +
    "conversa seguir aberta até a data. Diga a verdade sobre o motivo do contato; não invente novidade nem " +
    "urgência, e não antecipe a oferta. Se o cliente pediu para não ser procurado antes da data, não envie nada"
  );
}
