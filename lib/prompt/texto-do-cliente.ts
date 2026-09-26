/**
 * O TEXTO QUE O CLIENTE DIGITA, ANTES DE ENTRAR NO PROMPT.
 *
 * Toda aba estruturada do agente (Identidade, Oferta, Objeções…) compila o que o dono do negócio escreveu
 * num bloco do prompt do turno. Aquele texto é DADO, nunca instrução: entra reduzido a UMA linha, sem
 * aspas duplas (que fechariam a citação em que ele é posto) e sem caracteres de controle nem os
 * separadores de linha e de parágrafo do Unicode (que abririam uma seção nova no meio do prompt).
 *
 * Era uma cópia em cada compilador; na terceira aba virou módulo, porque uma correção de segurança
 * numa das cópias que não chegasse às outras seria um furo silencioso.
 */

/** Troca por espaço o que não é texto: controles, DEL e os separadores de linha/parágrafo do Unicode. */
export function semControle(texto: string): string {
  let saida = "";
  for (const ch of texto) {
    const c = ch.codePointAt(0) ?? 0;
    saida += c < 0x20 || c === 0x7f || c === 0x2028 || c === 0x2029 ? " " : ch;
  }
  return saida;
}

/** O texto do cliente como UMA linha, sem aspas duplas nem caracteres de controle. */
export function umaLinha(texto: string): string {
  return semControle(texto).replace(/["“”]/g, "'").replace(/\s+/g, " ").trim();
}
