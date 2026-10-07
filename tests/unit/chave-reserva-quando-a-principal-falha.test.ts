/**
 * CHAVE RESERVA NO SEAM — quando a chave do agente falha por conta, saldo ou recusa, outra assume.
 *
 * Em 07/10/2026 o saldo de UMA chave acabou por vinte minutos e 46 atendimentos morreram, com outras
 * chaves ativas cadastradas na mesma organização. A prova fica no único lugar que não mente: os
 * argumentos que chegam à FÁBRICA do provedor (qual chave, qual modelo) e o que é gravado em
 * `llm_calls`. Cada caso e o seu controle diferem numa variável só.
 */
import { describe, expect, it, vi } from "vitest";

// A decifragem não é o assunto: a "chave" vira o rótulo do ciphertext, para o teste saber QUAL
// credencial chegou à fábrica.
vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: ({ ciphertext }: { ciphertext: unknown }) => `chave:${String(ciphertext)}`,
}));

import {
  corpoDoAvisoDeReserva,
  FALHAS_QUE_PEDEM_OUTRA_CHAVE,
  TITULO_DA_RESERVA_EM_USO,
} from "@/lib/agent-engine/edge/llm/chave-reserva";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";

const ORG = "11111111-1111-4111-8111-111111111111";
const PRINCIPAL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

interface LinhaDeReserva {
  id: string;
  provider: string;
  label: string | null;
  model: string | null;
}

function poolFalso(reservas: LinhaDeReserva[]) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    consultas.push({ sql, params });
    if (sql.includes("settings->'llm'")) {
      return {
        rows: [{ llm: { provider: "deepseek", default_model: "deepseek-flash", params: {}, enabled_models: [] } }],
      };
    }
    // A consulta das reservas é a única que junta o catálogo de modelos.
    if (sql.includes("from ai_models m")) {
      return {
        rows: reservas.map((r) => ({
          ...r,
          api_key_encrypted: `reserva-${r.id}`,
          api_key_iv: "iv",
          api_key_tag: "tag",
        })),
      };
    }
    if (sql.includes("from ai_provider_credentials")) {
      return { rows: [{ id: PRINCIPAL, api_key_encrypted: "principal", api_key_iv: "iv", api_key_tag: "tag" }] };
    }
    if (sql.includes("insert into llm_calls")) return { rows: [{ id: "call-1" }] };
    return { rows: [], rowCount: 1 };
  });
  return { pool: { query } as never, consultas };
}

function erroDoProvedor(status: number, mensagem: string): Error {
  return Object.assign(new Error(mensagem), { statusCode: status });
}

const RESPOSTA_OK = {
  content: [{ type: "text", text: "ok" }],
  finishReason: { unified: "stop", raw: undefined },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
};

/** Registry espião: quem falha é decidido pela CHAVE que chegou à fábrica. */
function registrySpiao(falhaPorChave: Record<string, Error>) {
  const chamadas: Array<{ provider: string; apiKey: string; modelId: string }> = [];
  const fabrica = (provider: string) => (apiKey: string, modelId: string) => {
    chamadas.push({ provider, apiKey, modelId });
    return {
      specificationVersion: "v3",
      provider,
      modelId,
      doGenerate: async () => {
        const falha = falhaPorChave[apiKey];
        if (falha) throw falha;
        return RESPOSTA_OK;
      },
    } as never;
  };
  return { chamadas, registry: { deepseek: fabrica("deepseek"), openai: fabrica("openai") } };
}

const cfg = { budgetEnforcement: "off" } as never;
const entrada = {
  tenantId: ORG,
  purpose: "agent_turn",
  model: "deepseek-flash",
  system: "s",
  messages: [{ role: "user" as const, content: "oi" }],
  llmOverride: { provider: "deepseek", credentialId: PRINCIPAL },
};

const SEM_SALDO = erroDoProvedor(402, "Insufficient Balance");

function linhasDeLlmCalls(consultas: Array<{ sql: string; params: unknown[] }>) {
  return consultas
    .filter((c) => c.sql.includes("insert into llm_calls"))
    .map((c) => ({ falha: c.sql.includes("'erro'"), provider: c.params[5], model: c.params[6] }));
}

describe("chave reserva no seam", () => {
  it("sem saldo na principal: outra chave do MESMO provedor assume, com o mesmo modelo", async () => {
    const { pool, consultas } = poolFalso([
      { id: "r1", provider: "deepseek", label: "Segunda chave", model: "deepseek-flash" },
    ]);
    const { chamadas, registry } = registrySpiao({ "chave:principal": SEM_SALDO });

    const r = await runModelCall(pool, cfg, entrada, { registry: registry as never });

    expect(chamadas.map((c) => c.apiKey)).toEqual(["chave:principal", "chave:reserva-r1"]);
    expect(chamadas[1]).toMatchObject({ provider: "deepseek", modelId: "deepseek-flash" });
    expect(r.provider).toBe("deepseek");
    expect(r.model).toBe("deepseek-flash");
    // A falha da principal e o sucesso da reserva ficam AMBOS em llm_calls.
    expect(linhasDeLlmCalls(consultas)).toEqual([
      { falha: true, provider: "deepseek", model: "deepseek-flash" },
      { falha: false, provider: "deepseek", model: "deepseek-flash" },
    ]);
    // A reserva não tenta de novo a chave que acabou de falhar.
    const consultaDasReservas = consultas.find((c) => c.sql.includes("from ai_models m"));
    expect(consultaDasReservas?.params).toEqual([ORG, "deepseek", "deepseek-flash", PRINCIPAL]);
  });

  it("reserva de OUTRO provedor assume com o modelo dela, e é ele que vai para o custo e para quem chamou", async () => {
    const { pool, consultas } = poolFalso([{ id: "r2", provider: "openai", label: "SAAS", model: "gpt-reserva" }]);
    const { chamadas, registry } = registrySpiao({ "chave:principal": SEM_SALDO });

    const r = await runModelCall(pool, cfg, entrada, { registry: registry as never });

    expect(chamadas[1]).toEqual({ provider: "openai", apiKey: "chave:reserva-r2", modelId: "gpt-reserva" });
    expect(r.provider).toBe("openai");
    expect(r.model).toBe("gpt-reserva");
    expect(linhasDeLlmCalls(consultas).at(-1)).toEqual({ falha: false, provider: "openai", model: "gpt-reserva" });
  });

  it("a troca abre UM aviso na Central, sem nenhum pedaço de chave", async () => {
    const { pool, consultas } = poolFalso([{ id: "r2", provider: "openai", label: "SAAS", model: "gpt-reserva" }]);
    const { registry } = registrySpiao({ "chave:principal": SEM_SALDO });

    await runModelCall(pool, cfg, entrada, { registry: registry as never });

    const aviso = consultas.find((c) => c.sql.includes("insert into agent_inbox_items"));
    expect(aviso?.params[1]).toBe(TITULO_DA_RESERVA_EM_USO);
    expect(aviso?.sql).toContain("where not exists");
    expect(String(aviso?.params[2])).toContain("SAAS");
    expect(JSON.stringify(aviso?.params)).not.toContain("chave:");
  });

  it("chave recusada também troca; provedor fora do ar NÃO troca (a causa não é a chave)", async () => {
    expect(FALHAS_QUE_PEDEM_OUTRA_CHAVE.has("credencial_recusada")).toBe(true);
    const reservas = [{ id: "r1", provider: "deepseek", label: null, model: "deepseek-flash" }];

    const recusada = registrySpiao({ "chave:principal": erroDoProvedor(401, "Unauthorized") });
    await runModelCall(poolFalso(reservas).pool, cfg, entrada, { registry: recusada.registry as never });
    expect(recusada.chamadas).toHaveLength(2);

    const foraDoAr = registrySpiao({ "chave:principal": erroDoProvedor(503, "upstream timeout") });
    await expect(
      runModelCall(poolFalso(reservas).pool, cfg, entrada, { registry: foraDoAr.registry as never }),
    ).rejects.toThrow("upstream timeout");
    expect(foraDoAr.chamadas).toHaveLength(1);
  });

  it("chave de provedor que o motor não chama, ou sem modelo que sirva, é pulada", async () => {
    const { pool } = poolFalso([
      { id: "voz", provider: "elevenlabs", label: "Voz", model: null },
      { id: "sem-modelo", provider: "openai", label: null, model: null },
      { id: "r3", provider: "openai", label: null, model: "gpt-reserva" },
    ]);
    const { chamadas, registry } = registrySpiao({ "chave:principal": SEM_SALDO });

    await runModelCall(pool, cfg, entrada, { registry: registry as never });

    expect(chamadas.map((c) => c.apiKey)).toEqual(["chave:principal", "chave:reserva-r3"]);
  });

  it("todas falham: o erro que sobe é o ORIGINAL, e cada tentativa fica gravada", async () => {
    const { pool, consultas } = poolFalso([
      { id: "r1", provider: "deepseek", label: null, model: "deepseek-flash" },
      { id: "r2", provider: "openai", label: null, model: "gpt-reserva" },
    ]);
    const { registry } = registrySpiao({
      "chave:principal": SEM_SALDO,
      "chave:reserva-r1": erroDoProvedor(402, "Insufficient Balance (reserva 1)"),
      "chave:reserva-r2": erroDoProvedor(429, "rate limit (reserva 2)"),
    });

    await expect(runModelCall(pool, cfg, entrada, { registry: registry as never })).rejects.toBe(SEM_SALDO);
    expect(linhasDeLlmCalls(consultas)).toEqual([
      { falha: true, provider: "deepseek", model: "deepseek-flash" },
      { falha: true, provider: "deepseek", model: "deepseek-flash" },
      { falha: true, provider: "openai", model: "gpt-reserva" },
    ]);
    expect(consultas.some((c) => c.sql.includes("insert into agent_inbox_items"))).toBe(false);
  });

  it("turno que já executou ferramenta NÃO troca de chave: refazer a chamada mandaria a mensagem de novo", async () => {
    const { pool } = poolFalso([{ id: "r1", provider: "deepseek", label: null, model: "deepseek-flash" }]);
    const fabricadas: string[] = [];
    let geracoes = 0;
    const execute = vi.fn(async () => ({ ok: true }));
    const registry = {
      deepseek: (apiKey: string, modelId: string) => {
        fabricadas.push(apiKey);
        return {
          specificationVersion: "v3",
          provider: "deepseek",
          modelId,
          doGenerate: async () => {
            geracoes += 1;
            // 1º passo: o modelo pede o envio. 2º passo: a conta acaba.
            if (geracoes > 1) throw SEM_SALDO;
            return {
              ...RESPOSTA_OK,
              content: [{ type: "tool-call", toolCallId: "t1", toolName: "enviar", input: "{}" }],
              finishReason: { unified: "tool-calls", raw: undefined },
            };
          },
        } as never;
      },
    };
    const { tool } = await import("@/lib/agent-engine/edge/llm/run-model-call");
    const { z } = await import("zod");

    await expect(
      runModelCall(
        pool,
        cfg,
        {
          ...entrada,
          maxSteps: 4,
          tools: { enviar: tool({ description: "envia", inputSchema: z.object({}), execute }) },
        },
        { registry: registry as never },
      ),
    ).rejects.toBe(SEM_SALDO);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(fabricadas).toEqual(["chave:principal"]);
  });

  it("sem nenhuma reserva cadastrada: comportamento de antes — o erro sobe", async () => {
    const { pool } = poolFalso([]);
    const { chamadas, registry } = registrySpiao({ "chave:principal": SEM_SALDO });

    await expect(runModelCall(pool, cfg, entrada, { registry: registry as never })).rejects.toBe(SEM_SALDO);
    expect(chamadas).toHaveLength(1);
  });
});

describe("corpoDoAvisoDeReserva", () => {
  it("diz o que falhou, quem assumiu e o que fazer — e avisa da mudança de tom só quando troca de provedor", () => {
    const outro = corpoDoAvisoDeReserva({
      provedorPrincipal: "deepseek",
      motivo: "limite_ou_saldo",
      provedorReserva: "openai",
      rotuloReserva: "SAAS",
      modeloReserva: "gpt-reserva",
      mesmoProvedor: false,
    });
    expect(outro).toContain("sem saldo");
    expect(outro).toContain('"SAAS" (openai)');
    expect(outro).toContain("o tom das respostas pode mudar");

    const mesmo = corpoDoAvisoDeReserva({
      provedorPrincipal: "deepseek",
      motivo: "credencial_recusada",
      provedorReserva: "deepseek",
      rotuloReserva: null,
      modeloReserva: "deepseek-flash",
      mesmoProvedor: true,
    });
    expect(mesmo).toContain("recusou a chave");
    expect(mesmo).toContain("O modelo é o mesmo");
  });
});
