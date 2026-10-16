/**
 * O CANAL OFICIAL CRIA MODELO — E A LISTA CONTINUA SENDO ESPELHO DA META.
 *
 * Até aqui `POST /api/v1/channels/templates` só sincronizava, e a tela mandava
 * o operador "criar no Gerenciador do WhatsApp". Os parceiros Graph-compatíveis
 * já criavam pela tela; o oficial, que é o mesmo contrato, não.
 *
 * O que estes casos prendem:
 *  1. sem corpo continua sendo o sync de sempre — nenhum POST à Meta;
 *  2. `criar` faz o POST em `/{waba}/message_templates` com o token da SESSÃO
 *     no header (nunca no corpo nem na URL), audita e SÓ DEPOIS sincroniza —
 *     a linha nasce do que a Meta devolveu, não do que o operador digitou;
 *  3. a recusa da Meta chega ao operador com a mensagem dela, e não sincroniza;
 *  4. corpo malformado é 422 antes de qualquer rede.
 *
 * Medir: npx vitest run tests/unit/canal-oficial-cria-modelo.test.ts
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { syncTemplates } from "@/lib/channels/meta/template-sync";
import { POST } from "@/app/api/v1/channels/templates/route";

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/channels/meta/template-sync", () => ({ syncTemplates: vi.fn() }));
vi.mock("@/lib/channels/meta/session", () => ({
  metaSessionForOrg: vi.fn(async () => ({ wabaId: "waba-1", phoneNumberId: "pn-1" })),
}));
vi.mock("@/lib/channels/meta/credentials", () => ({
  resolveMetaCreds: vi.fn(async () => ({ token: "token-da-sessao", graphVersion: "v22.0" })),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

const CONTADORES = { inserted: 1, updated: 0, unchanged: 3, disabled: 0 };

const MODELO = {
  acao: "criar",
  name: "confirmacao_atendimento",
  language: "pt_BR",
  category: "UTILITY",
  components: [
    { type: "BODY", text: "Olá {{1}}, seu atendimento está confirmado.", example: { body_text: [["Ana"]] } },
  ],
};

function pedido(corpo?: unknown) {
  return new NextRequest("http://localhost:3000/api/v1/channels/templates", {
    method: "POST",
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(resposta: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({ ok, status, json: async () => resposta });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: "u-1" },
    org: { orgId: "org-1" },
  } as never);
  vi.mocked(syncTemplates).mockReset().mockResolvedValue(CONTADORES);
  vi.mocked(audit).mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/v1/channels/templates", () => {
  it("1. sem corpo continua sendo só o sync — nada é criado na Meta", async () => {
    const spy = stubFetch({});
    const res = await POST(pedido());
    expect(res.status).toBe(200);
    expect(spy).not.toHaveBeenCalled();
    expect(syncTemplates).toHaveBeenCalledOnce();
    expect(audit).not.toHaveBeenCalled();
  });

  it("2. criar posta na WABA com o token da sessão, audita e depois sincroniza", async () => {
    const spy = stubFetch({ id: "tpl-9", status: "PENDING", category: "UTILITY" });
    vi.mocked(syncTemplates).mockImplementation(async () => {
      // A ordem importa: o espelho só é lido depois que a Meta aceitou.
      expect(spy).toHaveBeenCalledOnce();
      return CONTADORES;
    });

    const res = await POST(pedido(MODELO));
    expect(res.status).toBe(200);

    const [url, init] = spy.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe("https://graph.facebook.com/v22.0/waba-1/message_templates");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-da-sessao");
    expect(url).not.toContain("token");
    const enviado = JSON.parse(init.body) as Record<string, unknown>;
    expect(enviado).toEqual({
      name: MODELO.name,
      language: MODELO.language,
      category: MODELO.category,
      components: MODELO.components,
    });
    expect(JSON.stringify(enviado)).not.toContain("token-da-sessao");

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "template.created", actorUserId: "u-1", organizationId: "org-1" }),
    );
    const corpo = (await res.json()) as { data: { criado: { id: string; status: string } } };
    expect(corpo.data.criado).toEqual({ id: "tpl-9", status: "PENDING", category: "UTILITY" });
  });

  it("3. a recusa da Meta chega ao operador e não sincroniza", async () => {
    stubFetch(
      {
        error: {
          message: "Invalid parameter",
          error_user_title: "Nome já existe",
          error_user_msg: "Já existe conteúdo neste idioma.",
        },
      },
      false,
      400,
    );
    const res = await POST(pedido(MODELO));
    expect(res.status).toBe(502);
    const corpo = (await res.json()) as { error: { message: string } };
    expect(corpo.error.message).toBe("Nome já existe: Já existe conteúdo neste idioma.");
    expect(syncTemplates).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("4. corpo malformado é 422 antes de qualquer rede", async () => {
    const spy = stubFetch({});
    const res = await POST(pedido({ acao: "criar", name: "x", language: "pt_BR", components: [] }));
    expect(res.status).toBe(422);
    expect(spy).not.toHaveBeenCalled();
    expect(syncTemplates).not.toHaveBeenCalled();
  });
});
