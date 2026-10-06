/**
 * JSON QUASE VÁLIDO — o conserto dos três defeitos que um modelo de linguagem comete ao escrever JSON.
 *
 * O fechamento do turno pede ao modelo um JSON de checkpoint. Quando ele vinha malformado, o turno
 * INTEIRO era re-tentado pela fila: medido em produção em 05/10/2026, ~10 vezes por dia, cada uma
 * refazendo um turno de ~88 mil tokens de entrada — com a resposta ao cliente já enviada.
 *
 * Os defeitos, na ordem em que aparecem em resumos longos:
 *   1. quebra de linha (ou outro caractere de controle) CRUA dentro de uma string — o resumo acumulado
 *      tem parágrafos, e `JSON.parse` recusa `\n` literal dentro de aspas;
 *   2. vírgula sobrando antes de `}` ou `]`;
 *   3. aspas tipográficas (“ ”) no lugar das retas, delimitando chave ou valor.
 *
 * É uma máquina de estados mínima (dentro/fora de string), e não uma regex: trocar quebra de linha por
 * `\n` fora de string corromperia o JSON que estava certo. Não inventa conteúdo, não fecha chave que
 * faltou, não adivinha: o que sobrar inválido continua inválido, e quem chama decide.
 */
export function repararJsonQuaseValido(texto: string): string {
  let saida = "";
  let dentroDeString = false;
  let escapado = false;
  let abriuTipografica = false;

  for (const ch of texto) {
    if (dentroDeString) {
      if (escapado) {
        saida += ch;
        escapado = false;
        continue;
      }
      if (ch === "\\") {
        saida += ch;
        escapado = true;
        continue;
      }
      // A string que abriu com aspa tipográfica fecha com a tipográfica; a que abriu com reta, só com
      // reta — dentro dela, “assim” é conteúdo.
      if (abriuTipografica ? ch === "”" || ch === "“" : ch === '"') {
        dentroDeString = false;
        saida += '"';
        continue;
      }
      if (abriuTipografica && ch === '"') {
        // Aspa reta dentro de string tipográfica é conteúdo: precisa de escape para não fechá-la.
        saida += '\\"';
        continue;
      }
      const codigo = ch.codePointAt(0) ?? 0;
      if (ch === "\n") saida += "\\n";
      else if (ch === "\r") saida += "\\r";
      else if (ch === "\t") saida += "\\t";
      else if (codigo < 0x20) saida += " ";
      else saida += ch;
      continue;
    }

    // Fora de string.
    if (ch === '"' || ch === "“" || ch === "”") {
      // Aspa tipográfica FORA de string só pode estar abrindo uma: vira aspa reta.
      dentroDeString = true;
      abriuTipografica = ch !== '"';
      saida += '"';
      continue;
    }
    if (ch === "}" || ch === "]") {
      // Vírgula sobrando: tira a última vírgula (e o espaço depois dela) antes de fechar.
      saida = saida.replace(/,\s*$/, "");
    }
    saida += ch;
  }
  return saida;
}

/**
 * O objeto do primeiro `{` ao último `}` do texto, lido com tolerância. `undefined` = não há JSON que
 * se aproveite (nem depois do reparo).
 */
export function lerJsonTolerante(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return undefined;
  const recorte = texto.slice(inicio, fim + 1);
  try {
    return JSON.parse(recorte) as unknown;
  } catch {
    try {
      return JSON.parse(repararJsonQuaseValido(recorte)) as unknown;
    } catch {
      return undefined;
    }
  }
}
