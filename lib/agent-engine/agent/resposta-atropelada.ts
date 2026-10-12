/**
 * A RESPOSTA ATROPELADA — a pessoa escreveu de novo enquanto a resposta anterior ainda saía.
 *
 * ─── O que se via em produção ─────────────────────────────────────────────────────────
 * A pessoa manda "Não tenho condições de pagar nada" e, 40 s depois, "Além de tudo minha mãe está
 * acamada". O turno da primeira mensagem já tinha começado a enviar (e turno que já enviou um balão não é
 * interrompido: `turno-ja-respondido.ts`). O turno da segunda roda em seguida com a conversa inteira e
 * responde de novo às duas: a pessoa lê a mesma acolhida duas vezes, a mesma pergunta duas vezes, e escreve
 * "tô falando com robô?". O corte de balão repetido (`balao-ja-enviado.ts`) só pega texto igual; aqui o
 * texto é outro e o assunto é o mesmo.
 *
 * ─── A régua ──────────────────────────────────────────────────────────────────────────
 * O turno é "atropelado" quando, depois da penúltima mensagem da pessoa, a agente já falou E a última
 * mensagem da pessoa chegou sem tempo de ela ter lido essa fala: até `JANELA_DE_LEITURA_S` segundos depois
 * do primeiro balão da resposta, ou antes de a resposta terminar (há balão da agente depois dela).
 *
 * Resposta rápida a uma pergunta ("Você sente isso?" → "sim", 40 s depois) NÃO é atropelo: a pessoa leu.
 * Por isso a janela é curta. Na dúvida o bloco não entra, e o turno segue como sempre.
 *
 * Tudo aqui é puro.
 */
export interface MensagemComHora {
  direction: string;
  sent_at: string;
}

/** Tempo que não dá para ler a resposta e escrever outra mensagem pensando nela. */
export const JANELA_DE_LEITURA_S = 20;

export function respostaAtropelada(mensagens: readonly MensagemComHora[]): boolean {
  let ultima = -1;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    if (mensagens[i]!.direction === 'inbound') {
      ultima = i;
      break;
    }
  }
  if (ultima <= 0) return false;
  // A fala da agente que veio depois da última mensagem da pessoa: a resposta anterior ainda estava saindo.
  if (mensagens.slice(ultima + 1).some((m) => m.direction === 'outbound')) return true;
  // Entre a penúltima e a última mensagem da pessoa: o primeiro balão da agente, se houver.
  let primeiroBalao: MensagemComHora | null = null;
  for (let i = ultima - 1; i >= 0; i--) {
    const m = mensagens[i]!;
    if (m.direction === 'inbound') break;
    if (m.direction === 'outbound') primeiroBalao = m;
  }
  if (primeiroBalao === null) return false;
  const intervalo = (Date.parse(mensagens[ultima]!.sent_at) - Date.parse(primeiroBalao.sent_at)) / 1000;
  return Number.isFinite(intervalo) && intervalo >= 0 && intervalo <= JANELA_DE_LEITURA_S;
}

/** O bloco do turno atropelado. '' quando não é o caso. */
export function blocoDaRespostaAtropelada(atropelada: boolean): string {
  if (!atropelada) return '';
  return [
    '',
    '',
    'A PESSOA ESCREVEU DE NOVO ENQUANTO A SUA RESPOSTA SAÍA (vale só para este turno)',
    '- As suas últimas falas, logo acima, JÁ responderam à mensagem anterior dela. Ela ainda não tinha lido quando escreveu a mensagem nova.',
    '- NÃO repita nada do que você acabou de dizer: nem a acolhida, nem a explicação, nem a pergunta. Não refaça pergunta que ela já respondeu.',
    '- Responda SÓ ao que a mensagem nova acrescenta, em 1 ou 2 balões curtos, e siga para o próximo passo do atendimento.',
    '- Se a mensagem nova não acrescenta nada ("ok", "sim", a mesma coisa com outras palavras), responda com UM balão curto que dá o próximo passo.',
  ].join('\n');
}
