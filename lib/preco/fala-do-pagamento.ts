/**
 * A AGENTE NÃO DESCREVE UM PAGAMENTO QUE NÃO EXISTE.
 *
 * Medido em 01/11/2026, com a chave Pix como caminho principal: "No link você paga no Pix" saiu em 5 conversas, com um
 * link que só aceita cartão; "o sistema me avisa assim que cair" em 3, com uma chave que não confirma sozinha e depende
 * do comprovante; e "Conseguiu copiar o código?" a quem recebeu uma chave. O texto vinha do roteiro antigo, de quando o
 * pagamento era o Pix copia e cola da Stripe.
 *
 * Pura. Só vale para quem cobra pela chave.
 */
const LINK_COM_PIX = /\bno\s+link\b[^.?!\n]{0,50}\bpix\b/i;
const SISTEMA_AVISA = /\bsistema\s+(?:me\s+)?avisa\b/i;
const CODIGO_DO_PIX = /\bc[óo]digo(?:\s+do\s+pix)?\b/i;
const FALA_DE_COPIAR = /\b(?:copiar|copiou|colar|colou)\b/i;
/** O começo de todo código de Pix copia e cola. */
const CODIGO_ENVIADO = /00020126/;

export function falaErradaDoPagamento(
  corpo: string,
  mensagens: ReadonlyArray<{ direction: string; body?: string | null }>,
): string | null {
  if (LINK_COM_PIX.test(corpo)) {
    return "O link é só de cartão: ele não aceita Pix. Reescreva dizendo que o Pix é pela chave e o link é para o cartão.";
  }
  if (SISTEMA_AVISA.test(corpo)) {
    return "O sistema não avisa quando o Pix pela chave cai. Reescreva pedindo o comprovante aqui na conversa, para você conferir.";
  }
  // Depois de um copia e cola enviado, "código" é a palavra certa.
  const mandouCodigo = mensagens.some((m) => m.direction === "outbound" && CODIGO_ENVIADO.test(m.body ?? ""));
  if (!mandouCodigo && CODIGO_DO_PIX.test(corpo) && FALA_DE_COPIAR.test(corpo)) {
    return "Ela recebeu uma chave Pix, não um código. Reescreva dizendo \"chave\".";
  }
  return null;
}
