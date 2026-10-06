/**
 * Dois defeitos lidos nos logs de produção em 05/10/2026:
 *   - saldo esgotado no provedor (HTTP 402, "Insufficient Balance") caía em `erro_desconhecido`;
 *   - retorno agendado num canal arquivado re-tentava 5 vezes até morrer, em vez de ser cancelado.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normalizarErro } from "@/lib/agent-engine/edge/llm/run-model-call";

describe("normalizarErro — saldo e limite", () => {
  it("402 com 'Insufficient Balance' é limite_ou_saldo, não erro desconhecido", () => {
    const erro = Object.assign(new Error("Insufficient Balance (request_id: abc)"), { statusCode: 402 });
    expect(normalizarErro(erro)).toMatchObject({ error_code: "limite_ou_saldo", http_status: 402 });
  });

  it.each(["Insufficient Balance", "insufficient funds on account", "Payment Required", "You exceeded your current quota"])(
    "a mensagem %s sozinha, sem status, também classifica",
    (mensagem) => {
      expect(normalizarErro(new Error(mensagem)).error_code).toBe("limite_ou_saldo");
    },
  );

  it("o que já era classificado continua igual", () => {
    expect(normalizarErro(Object.assign(new Error("x"), { statusCode: 401 })).error_code).toBe("credencial_recusada");
    expect(normalizarErro(Object.assign(new Error("x"), { statusCode: 429 })).error_code).toBe("limite_ou_saldo");
    expect(normalizarErro(Object.assign(new Error("x"), { statusCode: 503 })).error_code).toBe("provedor_indisponivel");
    expect(normalizarErro(new Error("algo que ninguém previu")).error_code).toBe("erro_desconhecido");
  });
});

describe("followup_turn em canal arquivado", () => {
  it("o erro é terminal: a fila cancela em vez de re-tentar até morrer", () => {
    const fonte = readFileSync("lib/agent-engine/agent/followup-turn.ts", "utf8");
    expect(fonte).toMatch(/archived_at\) throw Object\.assign\(new Error\('canal arquivado'\), \{ terminal: true \}\)/);
    // E o worker continua lendo a propriedade (e não a classe) para decidir.
    expect(readFileSync("workers/agent-worker/main.ts", "utf8")).toContain("terminal === true");
  });
});
