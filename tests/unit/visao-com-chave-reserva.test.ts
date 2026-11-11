import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 10–11/11/2026: a chave do xAI da visão passou a responder 403 e toda imagem — comprovante Pix
 * inclusive — falhou por 15 h, com a chave do Google ativa e validada na mesma organização. A visão
 * agora usa a mesma régua da chave reserva do turno (`chave-reserva.ts`).
 */

const factoryMock = vi.fn((_k: string, modelo: string) => `modelo:${modelo}`);
const listarMock = vi.fn();
const generateTextMock = vi.fn();
const visao = vi.hoisted(() => ({ enxerga: (_p: string, _m: string): boolean => true }));

const BINDING = { provider: "xai", model_id: "grok-4.20-non-reasoning", credential_id: "cred-xai", base_url: null as string | null };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      const linha =
        tabela === "ai_purpose_bindings"
          ? BINDING
          : tabela === "agent_inbox_items"
            ? null
            : { id: "msg1", organization_id: "org1", type: "image", media_mime: "image/jpeg", media_storage_path: "org1/c/msg1.jpg", media_derived_status: null };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const terminais: any = {
        maybeSingle: async () => ({ data: linha, error: null }),
        single: async () => ({ data: linha, error: null }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: linha ? [linha] : [], error: null }).then(resolve),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = new Proxy(terminais, { get: (alvo, prop) => (prop in alvo ? alvo[prop as keyof typeof alvo] : () => chain) });
      return chain;
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }) }) },
  }),
}));
vi.mock("@/lib/messaging/media/derive", () => ({ deriveMediaText: vi.fn(async () => "derivado") }));
vi.mock("@/lib/agent-engine/edge/llm/credentials", () => ({
  resolveOrgLlmConfig: vi.fn(async () => ({
    provider: "xai",
    apiKey: "chave-xai",
    credentialId: "cred-xai",
    origemDaChave: "credencial_da_organizacao",
    defaultModel: "grok-4.20-non-reasoning",
    params: {},
    enabledModels: [],
  })),
}));
vi.mock("@/lib/agent-engine/edge/llm/providers", () => ({
  createDefaultRegistry: () => ({ xai: factoryMock, google: factoryMock, openai: factoryMock }),
}));
vi.mock("@/lib/agent-engine/edge/llm/chave-reserva", async (original) => ({
  ...(await original<typeof import("@/lib/agent-engine/edge/llm/chave-reserva")>()),
  listarChavesDeReserva: (...a: unknown[]) => listarMock(...a),
}));
vi.mock("@/lib/ai/pontos/capacidade-em-vigor", () => ({
  visaoEmVigor: vi.fn(async ({ provider, modelId }: { provider: string; modelId: string }) => ({ enxerga: visao.enxerga(provider, modelId), sabemos: true })),
}));
vi.mock("ai", () => ({ generateText: (...a: unknown[]) => generateTextMock(...a) }));

import { deriveMediaText, type DeriveDeps } from "@/lib/messaging/media/derive";
import { deriveMessageMedia } from "@/workers/media-derive-worker";

const proibido = Object.assign(new Error("Forbidden"), { statusCode: 403 });
const evento = { id: "ev1", organization_id: "org1", event_type: "media.derive_requested", entity_kind: "message", entity_id: "msg1", payload: { message_id: "msg1" }, metadata: {}, consumed_by: [], attempts: 0 };

async function descrever(): Promise<string> {
  await deriveMessageMedia(evento as never);
  const deps = vi.mocked(deriveMediaText).mock.calls[0]?.[3] as DeriveDeps;
  return deps.describeImage(Buffer.from([1, 2, 3]), "image/jpeg");
}

beforeEach(() => {
  vi.clearAllMocks();
  BINDING.base_url = null;
  visao.enxerga = () => true;
  listarMock.mockResolvedValue([
    { credentialId: "cred-google", provider: "google", rotulo: "Google", apiKey: "chave-google", model: "gemini-3.5-flash" },
  ]);
});

describe("visão com chave reserva — 11/11/2026", () => {
  it("⭐ a principal recusa pela chave (403): a reserva com visão lê o comprovante", async () => {
    generateTextMock.mockRejectedValueOnce(proibido).mockResolvedValueOnce({ text: "Comprovante Pix R$ 27,00" });
    expect(await descrever()).toBe("Comprovante Pix R$ 27,00");
    expect(factoryMock).toHaveBeenLastCalledWith("chave-google", "gemini-3.5-flash");
    expect(listarMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: "xai", credencialQueFalhou: "cred-xai" }));
  });

  it("reserva cujo modelo não enxerga imagem é pulada, e sem outra o erro da principal segue", async () => {
    visao.enxerga = (p) => p !== "google";
    generateTextMock.mockRejectedValueOnce(proibido);
    await expect(descrever()).rejects.toThrow("Forbidden");
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it("falha que outra chave não resolve (5xx) não troca de chave", async () => {
    generateTextMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { statusCode: 500 }));
    await expect(descrever()).rejects.toThrow("boom");
    expect(listarMock).not.toHaveBeenCalled();
  });

  it("com endereço próprio no binding a chave não sai para outro provedor", async () => {
    BINDING.base_url = "https://gateway.exemplo/v1";
    generateTextMock.mockRejectedValue(proibido);
    // Recusa pelo destino ou erro da principal: nos dois casos nenhuma reserva é consultada.
    await descrever().catch(() => "");
    expect(listarMock).not.toHaveBeenCalled();
    expect(factoryMock).not.toHaveBeenCalledWith("chave-google", expect.anything());
  });
});
