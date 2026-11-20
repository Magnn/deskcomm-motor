/**
 * A área do cliente (`app/c/...`) é montada por componentes de servidor que passam props a componentes de
 * cliente. Prop de cliente atravessa a rede serializada: componente (função ou `forwardRef`, como os ícones do
 * lucide) não atravessa, e a página inteira cai com "Functions cannot be passed directly to Client Components".
 * Foi o que aconteceu de 20/10 a 30/10/2026 com `<CartaoDaVitrine Icone={Flame}>`: quem abria o link da área via
 * a tela de erro. A prova de tela de então rodou no Vite, que não serializa nada — por isso esta cerca lê o código.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome) ? [caminho] : [];
  });
}

const DA_AREA = arquivos(join(process.cwd(), "app", "c"));
const DE_CLIENTE = DA_AREA.filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));

describe("área do cliente: nada de componente como prop de componente de cliente", () => {
  it("encontra os componentes de cliente da área", () => {
    expect(DE_CLIENTE.length).toBeGreaterThan(5);
  });

  it.each(DE_CLIENTE.map((f) => [f.slice(process.cwd().length + 1), f]))("%s não recebe ícone/componente por prop", (_rotulo, f) => {
    const fonte = readFileSync(f, "utf8");
    expect(fonte).not.toMatch(/:\s*(?:LucideIcon|React\.ComponentType|ComponentType|React\.FC|FC)\b(?!\s*\[)/);
  });
});

/**
 * A mesma queda por outro caminho, de 07/11 a 19/11/2026: `_vista.tsx` (servidor) passava
 * `dataCurta={(iso) => …}` a `LeiturasDoQuiz` ("use client") e toda cliente logada via a tela de erro.
 * Arquivo de servidor da área não passa função por atributo JSX: manda o valor já calculado.
 */
const DE_SERVIDOR = DA_AREA.filter((f) => !DE_CLIENTE.includes(f));

describe("área do cliente: arquivo de servidor não passa função por prop", () => {
  it.each(DE_SERVIDOR.map((f) => [f.slice(process.cwd().length + 1), f]))("%s", (_rotulo, f) => {
    const fonte = readFileSync(f, "utf8");
    expect(fonte).not.toMatch(/=\{\s*(?:async\s+)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>|=\{\s*function\b/);
  });
});
