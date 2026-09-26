/**
 * A ORDEM dos blocos que o turno anexa ao prompt, lida do código-fonte de
 * `inbound-turn.ts`.
 *
 * Existe porque dois testes de "fiação" fixavam a linha INTEIRA
 * `` `${system}${a}${b}${c}` `` como texto. Fixar a linha inteira faz cada bloco
 * novo (o do anúncio foi o último) quebrar todo teste que já a citava, sem que
 * nenhuma regra tenha mudado — e a correção de sempre era colar a linha nova no
 * teste, que é o teste deixando de testar. O que cada um deles quer provar é uma
 * ORDEM entre blocos: aqui se lê a lista e se afirma a ordem, e bloco novo em
 * outro ponto da fila não mexe em teste nenhum.
 */
import { readFileSync } from "node:fs";

const ARQUIVO_DO_TURNO = "lib/agent-engine/agent/inbound-turn.ts";

/** Os nomes, na ordem em que entram, do `const systemDoTurno = \`${system}${…}…\``. */
export function blocosDoSystemDoTurno(): string[] {
  const fonte = readFileSync(ARQUIVO_DO_TURNO, "utf8");
  const linha = /const systemDoTurno = `([^`]*)`;/.exec(fonte);
  if (linha === null) {
    throw new Error(`${ARQUIVO_DO_TURNO}: não achei \`const systemDoTurno = \`…\`\` — a sonda ficou cega`);
  }
  return [...linha[1]!.matchAll(/\$\{([A-Za-z_$][\w$]*)\}/g)].map((m) => m[1]!);
}

/**
 * Devolve `null` quando `esperados` aparecem em `blocos` NESTA ordem (não
 * precisam ser vizinhos), senão a frase do que está fora do lugar — para o
 * `expect` mostrar o motivo em vez de `false`.
 */
export function foraDeOrdem(blocos: readonly string[], esperados: readonly string[]): string | null {
  let posicaoAnterior = -1;
  for (const nome of esperados) {
    const posicao = blocos.indexOf(nome);
    if (posicao === -1) return `"${nome}" não está na montagem [${blocos.join(", ")}]`;
    if (posicao < posicaoAnterior) return `"${nome}" veio antes do que deveria na montagem [${blocos.join(", ")}]`;
    posicaoAnterior = posicao;
  }
  return null;
}
