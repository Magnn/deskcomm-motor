/**
 * "Tentar de novo" na transcrição de um áudio: só refaz o que FALHOU, reabre o estado antes de pedir o
 * trabalho, e devolve a falha se o pedido não pôde ser enfileirado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));

const ORG = "22222222-2222-4222-8222-222222222222";
const MSG = "33333333-3333-4333-8333-333333333333";

interface Estado {
  mensagem: Record<string, unknown> | null;
  atualizacoes: Array<Record<string, unknown>>;
  eventos: Array<Record<string, unknown>>;
  erroDoEvento: boolean;
}
let estado: Estado;

const sessao = () => ({
  from: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: estado.mensagem, error: null }) };
    return chain;
  },
});

const admin = () => ({
  from: () => ({
    update: (patch: Record<string, unknown>) => {
      const filtros: Array<[string, unknown]> = [];
      const chain = {
        eq: (c: string, v: unknown) => {
          filtros.push([c, v]);
          return chain;
        },
        select: () => chain,
        // A reabertura só "acha" a linha quando ela ainda está em falha.
        maybeSingle: async () => {
          const aindaEmFalha = estado.mensagem?.media_derived_status === "failed";
          if (aindaEmFalha) estado.atualizacoes.push(patch);
          return { data: aindaEmFalha ? { id: MSG } : null, error: null };
        },
        then: (ok: (v: { error: null }) => unknown) => {
          estado.atualizacoes.push(patch);
          return Promise.resolve({ error: null }).then(ok);
        },
      };
      return chain;
    },
  }),
  rpc: async (_nome: string, args: Record<string, unknown>) => {
    if (estado.erroDoEvento) return { error: { message: "fila fora" } };
    estado.eventos.push(args);
    return { error: null };
  },
});

const post = () => new NextRequest("http://localhost/x", { method: "POST" });
const ctx = { params: Promise.resolve({ id: MSG }) };

beforeEach(() => {
  estado = {
    mensagem: { id: MSG, organization_id: ORG, conversation_id: "c1", type: "audio", media_storage_path: "o/c/a.ogg", media_derived_status: "failed" },
    atualizacoes: [],
    eventos: [],
    erroDoEvento: false,
  };
  vi.mocked(createClient).mockResolvedValue(sessao() as never);
  vi.mocked(createAdminClient).mockReturnValue(admin() as never);
  vi.mocked(audit).mockClear();
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u1", idioma: "pt-BR" },
    org: { orgId: ORG, name: "Org", role: "agent" },
  } as never);
});

describe("POST /messages/:id/retranscrever", () => {
  it("áudio em falha: reabre o estado, enfileira a derivação e registra na auditoria", async () => {
    const { POST } = await import("./route");
    const res = await POST(post(), ctx);

    expect(res.status).toBe(200);
    expect(estado.atualizacoes).toEqual([{ media_derived_status: null, media_derived_text: null }]);
    expect(estado.eventos).toHaveLength(1);
    expect(estado.eventos[0]).toMatchObject({ p_event_type: "media.derive_requested", p_entity_id: MSG, p_organization_id: ORG });
    expect(vi.mocked(audit).mock.calls[0]?.[0]).toMatchObject({ action: "message.transcription_retried", resourceId: MSG });
  });

  it.each([
    ["já transcrito", { media_derived_status: "ready" }],
    ["ainda em andamento", { media_derived_status: null }],
    ["não é áudio", { type: "image" }],
    ["áudio sem arquivo guardado", { media_storage_path: null }],
  ])("%s: 409, nada reaberto e nada enfileirado", async (_nome, over) => {
    estado.mensagem = { ...estado.mensagem, ...over };
    const { POST } = await import("./route");
    const res = await POST(post(), ctx);

    expect(res.status).toBe(409);
    expect(estado.atualizacoes).toEqual([]);
    expect(estado.eventos).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("mensagem que o ator não enxerga é 404", async () => {
    estado.mensagem = null;
    const { POST } = await import("./route");
    expect((await POST(post(), ctx)).status).toBe(404);
    expect(estado.eventos).toEqual([]);
  });

  it("se a fila recusar o pedido, o estado volta para falha (o botão continua na tela) e a resposta é 500", async () => {
    estado.erroDoEvento = true;
    const { POST } = await import("./route");
    const res = await POST(post(), ctx);

    expect(res.status).toBe(500);
    expect(estado.atualizacoes.at(-1)).toEqual({ media_derived_status: "failed" });
    expect(audit).not.toHaveBeenCalled();
  });

  it("id que não é UUID é 400", async () => {
    const { POST } = await import("./route");
    expect((await POST(post(), { params: Promise.resolve({ id: "x" }) })).status).toBe(400);
  });
});
