import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { loadAuthUser } from "@/lib/auth/server";
import { requireRole } from "@/lib/auth/require-role";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { metaCredsForPhoneNumberId } from "@/lib/channels/meta/credentials";
import * as perfil from "@/lib/channels/meta/perfil-do-numero";
import { createAdminClient } from "@/lib/supabase/admin";
import { GET, PATCH, POST } from "./route";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { INTERNAL_SECRET: "segredo" } }));
vi.mock("@/lib/channels/meta/credentials", () => ({ metaCredsForPhoneNumberId: vi.fn() }));
vi.mock("@/lib/channels/meta/perfil-do-numero", async (original) => ({
  ...(await original<typeof import("@/lib/channels/meta/perfil-do-numero")>()),
  lerPerfilDoNumero: vi.fn(),
  salvarPerfilComercial: vi.fn(),
  pedirNovoNome: vi.fn(),
  pedirCodigo: vi.fn(),
  conferirCodigo: vi.fn(),
  registrarNumero: vi.fn(),
}));

const org = "11111111-1111-4111-8111-111111111111";
const canal = "22222222-2222-4222-8222-222222222222";
const filtros: Record<string, unknown> = {};
const linha = { id: canal, organization_id: org, provider: CHANNEL_PROVIDER_META, archived_at: null, meta_phone_number_id: "num1", meta_app_id: null };
const update = vi.fn();
const contexto = (id = canal) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/v1/channel-sessions/${canal}/perfil-whatsapp`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(filtros)) delete filtros[k];
  vi.mocked(loadAuthUser).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: org }, org: { orgId: org, role: "admin" } } as Awaited<ReturnType<typeof requireRole>>);
  const query = {
    select: () => query,
    eq: (k: string, v: unknown) => { filtros[k] = v; return query; },
    is: (k: string, v: unknown) => { filtros[k] = v; return query; },
    maybeSingle: async () => ({
      data: Object.entries(filtros).every(([k, v]) => linha[k as keyof typeof linha] === v) ? linha : null,
      error: null,
    }),
    update: (v: unknown) => { update(v); return { eq: () => ({ eq: async () => ({ error: null }) }) }; },
  };
  vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as unknown as ReturnType<typeof createAdminClient>);
  vi.mocked(metaCredsForPhoneNumberId).mockResolvedValue({ phoneNumberId: "num1", token: "tok-secreto", graphVersion: "v21.0", source: "session" });
});

describe("perfil do WhatsApp pela tela", () => {
  it("só admin; negado não abre o banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({ ok: false, response: fail("forbidden", "Acesso negado.", 403) });
    expect((await GET(req("GET"), contexto())).status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("número de outra organização, ou que não é oficial, é 404", async () => {
    expect((await GET(req("GET"), contexto(org))).status).toBe(404);
    expect(filtros).toMatchObject({ organization_id: org, provider: CHANNEL_PROVIDER_META, archived_at: null });
  });

  it("sem credencial guardada: 422 com o que fazer", async () => {
    vi.mocked(metaCredsForPhoneNumberId).mockResolvedValue(null);
    const r = await GET(req("GET"), contexto());
    expect(r.status).toBe(422);
    expect((await r.json()).error.message).toContain("Conecte-o de novo");
  });

  it("lê na Meta, acompanha o nome aprovado e não devolve o token", async () => {
    vi.mocked(perfil.lerPerfilDoNumero).mockResolvedValue({
      ok: true,
      valor: {
        estado: { telefone: "+55", nome: "Esmeralda", situacaoDoNome: "APPROVED", nomePedido: null, situacaoDoNomePedido: null, conexao: "CONNECTED", verificacao: "VERIFIED", qualidade: "GREEN" },
        perfil: { fotoUrl: null },
      },
    });
    const r = await GET(req("GET"), contexto());
    expect(r.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ display_name: "Esmeralda" });
    expect(JSON.stringify(await r.json())).not.toContain("tok-secreto");
  });

  it("salva o perfil e audita só os nomes dos campos", async () => {
    vi.mocked(perfil.salvarPerfilComercial).mockResolvedValue({ ok: true, valor: null });
    const r = await PATCH(req("PATCH", { about: "Leituras", email: "a@b.com" }), contexto());
    expect(r.status).toBe(200);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.whatsapp_profile_updated", metadata: { campos: ["about", "email"] } }));
  });

  it("⭐ código do SMS: confere, registra e o código nunca vai para a auditoria", async () => {
    vi.mocked(perfil.conferirCodigo).mockResolvedValue({ ok: true, valor: null });
    vi.mocked(perfil.registrarNumero).mockResolvedValue({ ok: true, valor: null });
    const r = await POST(req("POST", { acao: "conferir_codigo", codigo: "654321" }), contexto());
    expect(r.status).toBe(200);
    expect(perfil.registrarNumero).toHaveBeenCalledWith(expect.objectContaining({ phoneNumberId: "num1", segredoDoPin: "segredo" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.phone_verified" }));
    expect(JSON.stringify(vi.mocked(audit).mock.calls)).not.toContain("654321");
  });

  it("recusa da Meta volta como 422 legível e não audita", async () => {
    vi.mocked(perfil.pedirNovoNome).mockResolvedValue({ ok: false, motivo: "nome fora das regras" });
    const r = await POST(req("POST", { acao: "nome", nome: "Esmeralda" }), contexto());
    expect(r.status).toBe(422);
    expect((await r.json()).error.message).toContain("nome fora das regras");
    expect(audit).not.toHaveBeenCalled();
  });

  it("ação desconhecida ou código malformado é 422 antes da Meta", async () => {
    expect((await POST(req("POST", { acao: "apagar" }), contexto())).status).toBe(422);
    expect((await POST(req("POST", { acao: "conferir_codigo", codigo: "12" }), contexto())).status).toBe(422);
    expect(perfil.conferirCodigo).not.toHaveBeenCalled();
  });
});
