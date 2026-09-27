/**
 * `gerarRascunho` — resolve o MESMO modelo/credencial que o agente usaria de verdade
 * (mesma ordem de `montarQuadro.ts`: credencial cadastrada vence, chave da instalação é o
 * fallback) e chama `generateObject`. O que este teste prende:
 *   1. sem versão do agente (ou sem provider/model nela) nunca chama a IA — `agente_sem_modelo`;
 *   2. credencial cadastrada resolve, e é ELA que vira a apiKey passada a `buildModel`;
 *   3. falha ao descriptografar a credencial vira `credencial_<motivo>`, sem chamar a IA;
 *   4. sem credencial cadastrada, cai para a chave da instalação — e sem ela, `sem_chave_<provider>`;
 *   5. falha do `generateObject` (schema, timeout, provedor fora do ar) vira `geracao_falhou`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@/lib/ai/credentials", () => {
  class CredentialUnavailableError extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
      this.name = "CredentialUnavailableError";
    }
  }
  return { loadCredential: vi.fn(), CredentialUnavailableError };
});
vi.mock("@/lib/ai/runtime/agent", () => ({ buildModel: vi.fn(), chaveDePlataforma: vi.fn() }));

import { generateObject } from "ai";

import { CredentialUnavailableError, loadCredential } from "@/lib/ai/credentials";
import { buildModel, chaveDePlataforma } from "@/lib/ai/runtime/agent";

import { gerarRascunho } from "./gerar";

const ORG = "org-1";
const AGENTE = "agente-1";

interface VersaoFake {
  provider: string | null;
  model: string | null;
  credential_id: string | null;
}

/** Fake mínimo do admin client — só a cadeia que `resolverModeloDoAgente` percorre. */
function fakeAdmin(versao: VersaoFake | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: versao, error: null }),
  };
  return { from: () => chain } as unknown as Parameters<typeof gerarRascunho>[0]["admin"];
}

const args = (admin: ReturnType<typeof fakeAdmin>, extra: { campo?: "identidade" | "limites" } = {}) => ({
  admin,
  agentId: AGENTE,
  organizationId: ORG,
  campo: extra.campo ?? ("identidade" as const),
  contexto: "uma clínica de estética em Fortaleza",
});

beforeEach(() => {
  vi.mocked(generateObject).mockReset();
  vi.mocked(loadCredential).mockReset();
  vi.mocked(buildModel).mockReset().mockReturnValue("modelo-fake" as never);
  vi.mocked(chaveDePlataforma).mockReset();
});

describe("gerarRascunho", () => {
  it("sem versão do agente: agente_sem_modelo, sem chamar a IA", async () => {
    const r = await gerarRascunho(args(fakeAdmin(null)));
    expect(r).toEqual({ ok: false, codigo: "agente_sem_modelo" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("versão sem provider/model: agente_sem_modelo", async () => {
    const r = await gerarRascunho(args(fakeAdmin({ provider: null, model: null, credential_id: null })));
    expect(r).toEqual({ ok: false, codigo: "agente_sem_modelo" });
  });

  it("credencial cadastrada resolve, e é ela que vira a apiKey do modelo", async () => {
    vi.mocked(loadCredential).mockResolvedValue({ apiKey: "chave-da-org", provider: "anthropic", label: "x" });
    vi.mocked(generateObject).mockResolvedValue({ object: { nome: "Ana" } } as never);

    const r = await gerarRascunho(args(fakeAdmin({ provider: "anthropic", model: "claude-x", credential_id: "cred-1" })));

    expect(r).toEqual({ ok: true, dados: { nome: "Ana" } });
    expect(buildModel).toHaveBeenCalledWith("anthropic", "chave-da-org", "claude-x");
    expect(chaveDePlataforma).not.toHaveBeenCalled();
  });

  it("credencial cadastrada falha ao descriptografar: credencial_<motivo>, sem chamar a IA", async () => {
    vi.mocked(loadCredential).mockRejectedValue(new CredentialUnavailableError("decrypt_failed", "x"));

    const r = await gerarRascunho(args(fakeAdmin({ provider: "anthropic", model: "claude-x", credential_id: "cred-1" })));

    expect(r).toEqual({ ok: false, codigo: "credencial_decrypt_failed" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("sem credencial cadastrada, cai para a chave da instalação", async () => {
    vi.mocked(chaveDePlataforma).mockReturnValue("chave-da-instalacao");
    vi.mocked(generateObject).mockResolvedValue({ object: { nunca_diz: ["garantia de resultado"] } } as never);

    const r = await gerarRascunho(
      args(fakeAdmin({ provider: "openai", model: "gpt-x", credential_id: null }), { campo: "limites" }),
    );

    expect(r).toEqual({ ok: true, dados: { nunca_diz: ["garantia de resultado"] } });
    expect(buildModel).toHaveBeenCalledWith("openai", "chave-da-instalacao", "gpt-x");
    expect(loadCredential).not.toHaveBeenCalled();
  });

  it("sem credencial cadastrada e sem chave da instalação: sem_chave_<provider>", async () => {
    vi.mocked(chaveDePlataforma).mockReturnValue(null);

    const r = await gerarRascunho(args(fakeAdmin({ provider: "openai", model: "gpt-x", credential_id: null })));

    expect(r).toEqual({ ok: false, codigo: "sem_chave_openai" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("generateObject falha (schema, timeout, provedor fora do ar): geracao_falhou", async () => {
    vi.mocked(chaveDePlataforma).mockReturnValue("chave-da-instalacao");
    vi.mocked(generateObject).mockRejectedValue(new Error("boom"));

    const r = await gerarRascunho(args(fakeAdmin({ provider: "openai", model: "gpt-x", credential_id: null })));

    expect(r).toEqual({ ok: false, codigo: "geracao_falhou" });
  });
});
