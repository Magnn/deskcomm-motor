// @vitest-environment node
/**
 * Upload de mídia para um item do nó "Conteúdo" — não é o upload do composer
 * (aquele é por CONVERSA; este é por FLUXO, e existe antes de qualquer
 * conversa). O que este teste prende:
 *   1. só manager+ sobe arquivo (mesmo teto de quem edita o grafo do fluxo);
 *   2. fluxo de outra organização é "não encontrado", sem tocar o Storage;
 *   3. o teto/formato por tipo é o de `validateOutboundMedia` (imagem >5MB
 *      recusa, mesmo dentro do teto do bucket);
 *   4. sucesso devolve um `storage_path` sob {org}/flow-content/{flowId}/.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const deps = vi.hoisted(() => ({ role: vi.fn(), support: vi.fn(), client: vi.fn(), admin: vi.fn() }));

vi.mock("@/lib/auth/require-role", () => ({ requireRole: deps.role }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: deps.support }));
vi.mock("@/lib/supabase/server", () => ({ createClient: deps.client }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.admin }));

import { POST } from "./route";

const FLOW_ID = "11111111-1111-4111-8111-111111111111";
const ORG = "org-1";

function clienteComFluxo(existe: boolean) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: existe ? { id: FLOW_ID } : null, error: null }),
  };
  return { from: () => chain };
}

let uploadMock: ReturnType<typeof vi.fn>;
function adminQueAceita() {
  uploadMock = vi.fn(async () => ({ error: null }));
  return { storage: { from: () => ({ upload: uploadMock }) } };
}

function requestComArquivo(bytes: number, mime: string, filename = "arquivo"): NextRequest {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], filename, { type: mime }));
  return new NextRequest(`http://localhost/api/v1/ai/followup-flows/${FLOW_ID}/content-media`, {
    method: "POST",
    body: form,
  });
}

const ctx = { params: Promise.resolve({ id: FLOW_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  deps.support.mockResolvedValue(null);
  deps.role.mockResolvedValue({
    ok: true,
    user: { id: "eu", idioma: "pt-BR" },
    org: { orgId: ORG, role: "manager" },
  });
  deps.client.mockResolvedValue(clienteComFluxo(true));
  deps.admin.mockReturnValue(adminQueAceita());
});

describe("POST /api/v1/ai/followup-flows/[id]/content-media", () => {
  it("sucesso: sobe e devolve storage_path sob {org}/flow-content/{flowId}/", async () => {
    const res = await POST(requestComArquivo(1024, "image/jpeg"), ctx);
    expect(res.status, await res.clone().text()).toBe(200);
    const corpo = (await res.json()) as { data: { storage_path: string; kind: string } };
    expect(corpo.data.kind).toBe("image");
    expect(corpo.data.storage_path.startsWith(`${ORG}/flow-content/${FLOW_ID}/`)).toBe(true);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("só manager+ sobe: viewer recebe a resposta de requireRole, sem tocar o Storage", async () => {
    deps.role.mockResolvedValue({ ok: false, response: new Response(JSON.stringify({ error: { code: "forbidden" } }), { status: 403 }) });
    const res = await POST(requestComArquivo(1024, "image/jpeg"), ctx);
    expect(res.status).toBe(403);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("fluxo de outra organização é 'não encontrado', sem tocar o Storage", async () => {
    deps.client.mockResolvedValue(clienteComFluxo(false));
    const res = await POST(requestComArquivo(1024, "image/jpeg"), ctx);
    expect(res.status).toBe(404);
  });

  it("imagem acima de 5MB é recusada (teto por tipo, não os 50MB do bucket)", async () => {
    const res = await POST(requestComArquivo(6 * 1024 * 1024, "image/jpeg"), ctx);
    expect(res.status).toBe(413);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("formato não suportado (webp) é 415, sem tocar o Storage", async () => {
    const res = await POST(requestComArquivo(1024, "image/webp"), ctx);
    expect(res.status).toBe(415);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("id que não é UUID é 400", async () => {
    const res = await POST(requestComArquivo(1024, "image/jpeg"), { params: Promise.resolve({ id: "não-é-uuid" }) });
    expect(res.status).toBe(400);
  });
});
