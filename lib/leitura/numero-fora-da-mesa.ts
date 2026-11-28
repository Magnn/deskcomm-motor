/**
 * NÚMERO FORA DA MESA DADO COMO ANOTADO — a agente confirmando uma escolha que não existe.
 *
 * Medido em 22–23/11/2026: "2, 5 e 23, anotado, meu bem. Respira que agora eu viro a carta" e, no balão seguinte, "o 23 fica
 * fora". E "Anotei os números, meu bem. 1, 2, 3 e 5" (quatro números, a mesa lê três). A pessoa ouve duas coisas opostas
 * no mesmo minuto. O baralho tem 22 cartas e a leitura, 3: confirmar outra coisa é recusado antes de sair. Puro.
 */
const ANOTADO = /\banot(?:ad[oa]s?|ei|o)\b/i;

/** A recusa para o modelo, ou `null` quando a confirmação é válida (ou não há confirmação de números). */
export function numerosAnotadosForaDaMesa(texto: string, quantidade = 3): string | null {
  const frases = texto.split(/(?<=[.!?\n])\s+/);
  for (let i = 0; i < frases.length; i++) {
    if (!ANOTADO.test(frases[i]!)) continue;
    // "Anotei os números, meu bem. 1, 2, 3 e 5.": os números podem vir na frase seguinte.
    const frase = `${frases[i]} ${frases[i + 1] ?? ""}`;
    const numeros = (frase.match(/\b\d{1,3}\b/g) ?? []).map(Number);
    if (numeros.length < 2) continue;
    const fora = numeros.filter((n) => n < 1 || n > 22);
    if (fora.length > 0) {
      return `Envio recusado: a mensagem dá como anotado o ${fora.join(" e o ")}, que não existe na mesa (são 22 cartas, de 1 a 22). Não confirme a escolha: diga que esse número fica fora e peça só o que falta para completar ${quantidade} números de 1 a 22.`;
    }
    if (numeros.length > quantidade) {
      return `Envio recusado: a mensagem dá como anotados mais de ${quantidade} números, e a leitura é de ${quantidade} cartas. Não confirme a escolha: peça que ela diga só ${quantidade} números de 1 a 22.`;
    }
  }
  return null;
}
