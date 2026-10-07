/**
 * O worker precisa ser o PID 1 do contêiner.
 *
 * `docker stop` manda SIGTERM ao PID 1. Com `CMD ["pnpm", "exec", "tsx", …]` o PID 1 era
 * o pnpm e o worker era neto dele: o sinal não chegava, o `shutdown` de
 * `workers/agent-worker/main.ts` (que espera os turnos em curso e devolve à fila o que
 * sobrar) nunca rodava, e os jobs ficavam `running` no nome de um processo morto até o
 * visibility timeout. Como o cap de concorrência do claim é global, o worker seguinte
 * subia com as vagas ocupadas — medido em 07/10/2026: 15 de 16 por 10 minutos.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");

function cmdDoWorker(): string[] {
  const linha = readFileSync(join(RAIZ, "Dockerfile.worker"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith("CMD "))
    .at(-1);
  if (linha === undefined) throw new Error("Dockerfile.worker sem CMD");
  return JSON.parse(linha.slice(4)) as string[];
}

describe("Dockerfile.worker — quem recebe o SIGTERM", () => {
  it("o processo do worker é o próprio node, não um gerenciador na frente dele", () => {
    const cmd = cmdDoWorker();
    expect(cmd[0]).toBe("node");
    expect(cmd).not.toContain("pnpm");
    expect(cmd).not.toContain("npm");
    expect(cmd.at(-1)).toBe("workers/agent-worker/main.ts");
  });

  it("o tsx entra como loader do node, e não como processo pai", () => {
    const cmd = cmdDoWorker();
    const i = cmd.indexOf("--import");
    expect(i).toBeGreaterThan(0);
    expect(cmd[i + 1]).toBe("tsx");
  });
});
