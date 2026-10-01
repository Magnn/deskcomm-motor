// @vitest-environment node
/**
 * Transcrição do áudio de um item do nó "Conteúdo". O que este teste prende:
 *   1. só manager+ transcreve;
 *   2. fluxo de outra organização é "não encontrado";
 *   3. ⭐ só se transcreve arquivo DESTE fluxo — path de outro fluxo, de outra
 *      organização ou de uma conversa é "não encontrado", sem baixar nada;
 *   4. sem chave da OpenAI: 422 com a instrução, sem chamar o provedor;
 *   5. sucesso devolve o texto, aparado;
 *   6. falha do provedor vira 502 sem vazar o detalhe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({
  role: vi.fn(),
  support: vi.fn(),
  client: vi.fn(),
  admin: vi.fn(),
  chave: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/supabase/server", () => ({ createClient: deps.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));
vi.mock("@/lib/ai/embeddings/chave", () => ({ chaveOpenAiParaTranscricao: deps.chave }));
vi.mock("@/lib/messaging/media/transcription", () => ({
  apiTranscriptionProvider: () => ({ transcribe: deps.transcribe }),
}));

import { POST } from "./route";

const FLOW_ID = "11111111-1111-4111-8111-111111111111";
const OUTRO_FLUXO = "22222222-2222-4222-8222-222222222222";
const ORG = "org-1";
const CAMINHO = `${ORG}/flow-content/${FLOW_ID}/audio.ogg`;

function clienteComFluxo(existe: boolean) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: existe ? { id: FLOW_ID } : null, error: null }),
  };
  return { from: () => chain };
}

let downloadMock: ReturnType<typeof vi.fn>;
function adminComArquivo(bytes = 1024) {
  downloadMock = vi.fn(async () => ({ data: new Blob([new Uint8Array(bytes)]), error: null }));
  return { storage: { from: () => ({ download: downloadMock }) } };
}

function pedido(corpo: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/v1/ai/followup-flows/${FLOW_ID}/content-media/transcribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

const ctx = { params: Promise.resolve({ id: FLOW_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({ ok: true, user: { id: "eu", idioma: "pt-BR" }, org: { orgId: ORG, role: "manager" } });
  deps.client.mockResolvedValue(clienteComFluxo(true));
  deps.admin.mockReturnValue(adminComArquivo());
  deps.chave.mockResolvedValue("sk-de-teste");
  deps.transcribe.mockResolvedValue("  Olá, tudo bem? Aqui é do suporte.  ");
});

describe("POST …/content-media/transcribe", () => {
  it("sucesso: devolve a transcrição aparada", async () => {
    const res = await POST(pedido({ storage_path: CAMINHO, mime: "audio/ogg" }), ctx);
    expect(res.status, await res.clone().text()).toBe(200);
    const corpo = (await res.json()) as { data: { transcript: string } };
    expect(corpo.data.transcript).toBe("Olá, tudo bem? Aqui é do suporte.");
    expect(downloadMock).toHaveBeenCalledWith(CAMINHO);
  });

  it("só manager+: quem não é recebe a resposta de requireRole, sem baixar nada", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response("{}", { status: 403 }) });
    const res = await POST(pedido({ storage_path: CAMINHO, mime: "audio/ogg" }), ctx);
    expect(res.status).toBe(403);
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("fluxo de outra organização é 'não encontrado'", async () => {
    deps.client.mockResolvedValue(clienteComFluxo(false));
    const res = await POST(pedido({ storage_path: CAMINHO, mime: "audio/ogg" }), ctx);
    expect(res.status).toBe(404);
    expect(deps.transcribe).not.toHaveBeenCalled();
  });

  it.each([
    ["arquivo de OUTRO fluxo", `${ORG}/flow-content/${OUTRO_FLUXO}/audio.ogg`],
    ["arquivo de OUTRA organização", `org-2/flow-content/${FLOW_ID}/audio.ogg`],
    ["mídia de uma conversa", `${ORG}/conversa-9/mensagem.ogg`],
    ["path com travessia", `${ORG}/flow-content/${FLOW_ID}/../../org-2/x.ogg`],
  ])("⭐ %s não é transcrito, e nada é baixado", async (_caso, caminho) => {
    const res = await POST(pedido({ storage_path: caminho, mime: "audio/ogg" }), ctx);
    expect(res.status).toBe(404);
    expect(downloadMock).not.toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
  });

  it("arquivo que não é áudio é recusado", async () => {
    const res = await POST(pedido({ storage_path: `${ORG}/flow-content/${FLOW_ID}/a.pdf`, mime: "application/pdf" }), ctx);
    expect(res.status).toBe(415);
  });

  it("sem chave da OpenAI: 422 com a instrução, sem baixar nem chamar o provedor", async () => {
    deps.chave.mockResolvedValue(null);
    const res = await POST(pedido({ storage_path: CAMINHO, mime: "audio/ogg" }), ctx);
    expect(res.status).toBe(422);
    const corpo = (await res.json()) as { error: { code: string; message: string } };
    expect(corpo.error.code).toBe("transcription_unavailable");
    expect(corpo.error.message).toContain("OpenAI");
    expect(downloadMock).not.toHaveBeenCalled();
    expect(deps.transcribe).not.toHaveBeenCalled();
  });

  it("falha do provedor vira 502 e não vaza o detalhe", async () => {
    deps.transcribe.mockRejectedValue(new Error("transcription_401 sk-segredo"));
    const res = await POST(pedido({ storage_path: CAMINHO, mime: "audio/ogg" }), ctx);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("sk-segredo");
  });

  it("corpo sem os campos é 422", async () => {
    const res = await POST(pedido({ storage_path: CAMINHO }), ctx);
    expect(res.status).toBe(422);
  });
});
