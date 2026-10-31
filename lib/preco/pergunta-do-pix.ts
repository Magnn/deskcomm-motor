/**
 * A PERGUNTA "QUER QUE EU TE MANDE O PIX?" SÓ SAI UMA VEZ.
 *
 * Medido em 31/10/2026: uma cliente pediu "algum trabalho, para ele voltar", ouviu o valor e recebeu a mesma pergunta
 * sete vezes em 45 minutos, sem o código nunca sair. Ela não disse sim nem não: perguntou se o trabalho funcionava. O
 * que trava a venda é a pergunta no lugar da cobrança, porque cada resposta de quem hesita vira mais uma pergunta.
 *
 * Valor novo reabre a pergunta: é outra oferta. Depois de uma cobrança enviada a contagem recomeça.
 *
 * Tudo aqui é puro.
 */
const PERGUNTA_DO_PIX = /\b(quer|prefere|posso|deseja)\b[^?.!\n]{0,40}\b(mand|envi)\w*[^?.!\n]{0,25}\bpix\b[^?\n]*\?/i;
const COBRANCA = /(^|\s)000201|https:\/\/\S*(pay|buy|checkout|boleto)\S*/i;
const VALOR = /R\$\s?\d[\d.]*(?:,\d{2})?/g;

interface Mensagem {
  direction: string;
  body?: string | null;
}

const valores = (texto: string): string[] => (texto.match(VALOR) ?? []).map((v) => v.replace(/\s/g, ""));

/** As perguntas do Pix que a agente fez depois da última cobrança enviada. */
function perguntasSemCobranca(mensagens: readonly Mensagem[]): string[] {
  const perguntas: string[] = [];
  for (const m of mensagens) {
    if (m.direction !== "outbound") continue;
    const corpo = m.body ?? "";
    if (COBRANCA.test(corpo)) perguntas.length = 0;
    else if (PERGUNTA_DO_PIX.test(corpo)) perguntas.push(corpo);
  }
  return perguntas;
}

/** A agente já perguntou se manda o Pix, e o Pix não saiu? */
export function jaPerguntouDoPix(mensagens: readonly Mensagem[]): boolean {
  return perguntasSemCobranca(mensagens).length > 0;
}

/** Este corpo repete a pergunta? Com um valor que ainda não foi perguntado, não repete: é uma oferta nova. */
export function repetePerguntaDoPix(corpo: string, mensagens: readonly Mensagem[]): boolean {
  if (COBRANCA.test(corpo) || !PERGUNTA_DO_PIX.test(corpo)) return false;
  const anteriores = perguntasSemCobranca(mensagens);
  if (anteriores.length === 0) return false;
  const jaDitos = new Set(anteriores.flatMap(valores));
  return !valores(corpo).some((v) => !jaDitos.has(v));
}

export const LINHA_DA_PERGUNTA_DO_PIX =
  '- PIX JÁ OFERECIDO: você já perguntou se podia mandar o Pix e ele não saiu. É PROIBIDO perguntar de novo, com estas ou outras palavras. Se ela pediu o trabalho, perguntou sobre ele ou não disse que não quer, responda a dúvida em uma frase e mande a cobrança agora, no valor em vigor, do jeito descrito acima. Se ela disse que não pode ou não quer, responda ao que ela disse e não fale de Pix.';

export const RECUSA_DA_PERGUNTA_DO_PIX =
  'Você já perguntou se podia mandar o Pix: esta mensagem repete a pergunta e NÃO foi enviada. Reescreva sem perguntar. Se ela pediu o trabalho, perguntou sobre ele ou não disse que não quer, mande a cobrança agora, no valor em vigor. Se ela disse que não pode ou não quer, responda ao que ela disse sem falar de Pix.';
