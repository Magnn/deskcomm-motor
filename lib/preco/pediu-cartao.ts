/**
 * ELA PEDIU PARA PAGAR NO CARTÃO: vai o link, e só o link.
 *
 * Medido em 21/11/2026: a cliente escreveu que tinha de ser no link e que não tinha como fazer no Pix. A cobrança
 * saía sempre como chave Pix + link de cartão no fim, a agente insistiu na chave duas vezes e, quando ela disse que
 * não tinha dinheiro na conta, encerrou como "sem dinheiro". Quem mandou o link foi o atendimento humano.
 *
 * Quem pede cartão não está sem dinheiro: tem limite e não tem saldo. Aqui a conversa é lida e o resultado decide
 * a forma da cobrança no envio e o aviso no bloco do turno. Pura.
 */

type Fala = { direction: "inbound" | "outbound"; body: string | null };

const PEDE_CARTAO = [
  /\b(?:no|pelo|via|por|o|um|esse|do)\s+link\b/,
  /\b(?:no|pelo|com|de|meu)\s+cartao\b/,
  /\bno\s+credito\b/,
  /\bparcel\w*/,
  /\bnao\s+(?:tenho|consigo|da|posso|faco)\s+(?:\S+\s+){0,3}(?:no|o|de|pelo|por)\s+pix\b/,
  /\bpix\s+(?:nao|n)\b/,
];
/** "sem crédito no cartão", "não tenho cartão", "cartão estourado": cartão é o que ela NÃO tem. */
const SEM_CARTAO = /\b(?:sem|nao\s+tenho|nao\s+uso)\s+(?:\S+\s+){0,3}cartao\b|\bcartao\s+(?:\S+\s+){0,2}(?:estourad|bloquead|sem\s+limite|sem\s+credito|negad|recusad)\w*/;
/** A nossa mensagem que levou a cobrança: dali para trás o pedido era de outra hora. */
const LEVOU_COBRANCA = /buy\.stripe\.com|pra pagar no pix|\b000201|\[\[PIX/i;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Esta fala da pessoa pede cartão (ou recusa o Pix sem recusar o cartão). */
export function falaPedeCartao(corpo: string): boolean {
  const t = semAcento(corpo);
  return !SEM_CARTAO.test(t) && PEDE_CARTAO.some((r) => r.test(t));
}

/**
 * A pessoa pediu cartão nas falas dela desde a penúltima cobrança nossa: o pedido vale para a cobrança que veio
 * logo depois dele e para a seguinte ("tem que ser no link" → chave de novo → "não tenho como fazer no Pix").
 */
export function pediuCartao(mensagens: readonly Fala[]): boolean {
  let cobrancas = 0;
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction === "outbound") {
      if (LEVOU_COBRANCA.test(m.body ?? "") && ++cobrancas >= 2) return false;
      continue;
    }
    if (falaPedeCartao(m.body ?? "")) return true;
  }
  return false;
}
