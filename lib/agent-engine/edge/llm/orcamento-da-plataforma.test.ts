import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: () => Buffer.from(""),
  decryptKey: () => "chave-byok-da-org",
}));

import { resolveOrgLlmConfig, llmEdgeConfigFromEnv, type LlmEdgeConfig } from "./credentials";
import { decidirOrcamento, PISO_DE_TETO_CENTS } from "./orcamento";
import { tetoDaPlataforma } from "./orcamento-da-plataforma";

const PLANOS = { ativos: true, catalogoDeclarado: "" };

describe("tetoDaPlataforma", () => {
  it("assinatura ativa: o teto é o do plano, em bloquear, sem carência", () => {
    const t = tetoDaPlataforma(PLANOS, { planoId: "pro", status: "ativa" });
    expect(t).toMatchObject({ modo: "bloquear", tetoCents: 1_200, plano: "pro" });
    expect(t.efetivoEm.getTime()).toBe(0);
  });

  it("sem assinatura, inativa, ou plano que não existe: o PISO — a plataforma não paga IA sem limite", () => {
    for (const a of [null, { planoId: "pro", status: "inativa" }, { planoId: "fantasma", status: "ativa" }]) {
      expect(tetoDaPlataforma(PLANOS, a)).toMatchObject({ modo: "bloquear", tetoCents: PISO_DE_TETO_CENTS, plano: null });
    }
  });

  it("o catálogo do .env manda; plano declarado sem IA (0) cai no piso, nunca em 'sem teto'", () => {
    const declarado = { ativos: true, catalogoDeclarado: "basico:Básico:4900:1:0,top:Top:99900:20:9000" };
    expect(tetoDaPlataforma(declarado, { planoId: "top", status: "ativa" }).tetoCents).toBe(9_000);
    const semIa = tetoDaPlataforma(declarado, { planoId: "basico", status: "ativa" });
    expect(semIa.tetoCents).toBe(PISO_DE_TETO_CENTS);
    // A prova que importa: o decisor de fato BLOQUEIA acima do piso.
    const veredito = decidirOrcamento({
      modo: semIa.modo,
      tetoCents: semIa.tetoCents,
      gastoCents: PISO_DE_TETO_CENTS + 1,
      efetivoEm: semIa.efetivoEm,
      agora: new Date(),
      purpose: "agent_turn",
      chave: "on",
      limiarPct: semIa.limiarPct,
      avisadoNesteMes: true,
    });
    expect(veredito.acao).toBe("bloquear");
  });
});

/** Pool falso: config (sem teto armado pela org), credencial BYOK, e a assinatura. */
function poolFake(opcoes: { byok: boolean; assinatura: { plan_id: string; status: string } | null | "erro" }) {
  const chamadas: string[] = [];
  return {
    chamadas,
    pool: {
      query: async (sql: string) => {
        chamadas.push(sql);
        if (sql.includes("from organizations")) return { rows: [{ llm: { provider: "openai" }, teto: 5000, modo: "off" }] };
        if (sql.includes("ai_provider_credentials")) return { rows: opcoes.byok ? [{ api_key_encrypted: "x", api_key_iv: "x", api_key_tag: "x" }] : [] };
        if (sql.includes("organization_subscriptions")) {
          if (opcoes.assinatura === "erro") throw new Error("relation does not exist");
          return { rows: opcoes.assinatura ? [opcoes.assinatura] : [] };
        }
        throw new Error(`consulta inesperada: ${sql}`);
      },
    } as never,
  };
}

const cfg = (planosAtivos: boolean): LlmEdgeConfig => ({
  openaiApiKey: "sk-plataforma",
  planos: { ativos: planosAtivos, catalogoDeclarado: "" },
});

describe("resolveOrgLlmConfig — teto de quem usa a chave da PLATAFORMA", () => {
  it("planos ligados + chave da plataforma: o teto da tela (modo off) é trocado pelo do plano", async () => {
    const { pool } = poolFake({ byok: false, assinatura: { plan_id: "start", status: "ativa" } });
    const out = await resolveOrgLlmConfig(pool, cfg(true), "org-1");
    expect(out.origemDaChave).toBe("chave_da_instalacao");
    expect(out.orcamento).toMatchObject({ modo: "bloquear", tetoCents: 500 });
  });

  it("chave PRÓPRIA da empresa: o teto é o que ela escolheu, e a assinatura nem é lida", async () => {
    const { pool, chamadas } = poolFake({ byok: true, assinatura: { plan_id: "start", status: "ativa" } });
    const out = await resolveOrgLlmConfig(pool, cfg(true), "org-1");
    expect(out.origemDaChave).toBe("credencial_da_organizacao");
    expect(out.orcamento).toMatchObject({ modo: "off", tetoCents: 5000 });
    expect(chamadas.some((s) => s.includes("organization_subscriptions"))).toBe(false);
  });

  it("planos desligados (quem usa o sistema para a própria empresa): nada muda", async () => {
    const { pool } = poolFake({ byok: false, assinatura: null });
    const out = await resolveOrgLlmConfig(pool, cfg(false), "org-1");
    expect(out.orcamento).toMatchObject({ modo: "off", tetoCents: 5000 });
  });

  it("falha ao ler a assinatura cai no piso, em bloquear — nunca em IA sem limite", async () => {
    const { pool } = poolFake({ byok: false, assinatura: "erro" });
    const out = await resolveOrgLlmConfig(pool, cfg(true), "org-1");
    expect(out.orcamento).toMatchObject({ modo: "bloquear", tetoCents: PISO_DE_TETO_CENTS });
  });
});

describe("llmEdgeConfigFromEnv — os planos chegam à camada (app e worker)", () => {
  it("lê PLANS_ENFORCED e PLANS_CATALOG", () => {
    expect(llmEdgeConfigFromEnv({ PLANS_ENFORCED: " TRUE ", PLANS_CATALOG: "x:X:1:1:100" }).planos).toEqual({ ativos: true, catalogoDeclarado: "x:X:1:1:100" });
    expect(llmEdgeConfigFromEnv({}).planos).toEqual({ ativos: false, catalogoDeclarado: "" });
  });
});
