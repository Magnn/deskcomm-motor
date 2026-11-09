import { readFileSync } from "node:fs";

import { tool } from "ai";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { semExecutar } from "./run-model-call";

/**
 * O resumo do turno (checkpoint) é a 2ª chamada logo depois da resposta. O provedor só lê
 * do cache se o pedido começar idêntico — e as tools entram no pedido antes das mensagens.
 * Medido em 08/11: sem as tools, ~4 mil tokens por resumo pagavam preço cheio.
 */
describe("resumo do turno com o mesmo prefixo da resposta", () => {
  it("semExecutar mantém nome, descrição e esquema e tira o execute", () => {
    const tools = {
      send_message: tool({ description: "envia", inputSchema: z.object({ texto: z.string() }), execute: async () => "ok" }),
    };
    const sem = semExecutar(tools)!;
    expect(Object.keys(sem)).toEqual(["send_message"]);
    expect(sem.send_message.description).toBe("envia");
    expect(sem.send_message.inputSchema).toBe(tools.send_message.inputSchema);
    expect(sem.send_message.execute).toBeUndefined();
    expect(semExecutar(undefined)).toBeUndefined();
  });

  it("a chamada do checkpoint leva as tools da resposta, sem poder usá-las", () => {
    const fonte = readFileSync("lib/agent-engine/agent/inbound-turn.ts", "utf8");
    const chamada = fonte.slice(fonte.indexOf("purpose: 'checkpoint'"), fonte.indexOf("CHECKPOINT_INSTRUCTION }"));
    expect(chamada).toMatch(/\btools,/);
    expect(chamada).toContain("toolChoice: 'none'");
  });

  it("o seam repassa o toolChoice e usa as tools sem execute quando é 'none'", () => {
    const fonte = readFileSync("lib/agent-engine/edge/llm/run-model-call.ts", "utf8");
    expect(fonte).toContain("input.toolChoice === 'none' ? semExecutar(prefix.tools)");
    expect(fonte).toContain("toolChoice: input.toolChoice");
  });
});
