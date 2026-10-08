import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * COEXISTÊNCIA — o número no aplicativo do celular E na API.
 *
 * O que este arquivo guarda é o que torna a coexistência segura de ligar: a
 * mensagem que o negócio manda pelo celular chega, entra no histórico como saída
 * feita por fora do CRM e PAUSA o agente naquela conversa. Sem isso, o agente
 * responde por cima de quem está atendendo à mão.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const SEGREDO = "app-secret-de-teste";

const h = vi.hoisted(() => ({
  pausar: vi.fn(),
  marcar: vi.fn(),
  posEntrada: vi.fn(),
  sessoes: [] as { id: string; organization_id: string; meta_waba_id: string | null }[],
  filtros: [] as [string, unknown][],
  inseridas: [] as Record<string, unknown>[],
  erroDoInsert: null as { code: string; message: string } | null,
}));

vi.mock("@/lib/escalacao/atendimento-manual", () => ({ pausarIaPorAtendimentoManual: h.pausar }));
vi.mock("@/lib/channels/marcar-conversa", () => ({ marcarConversaComMensagem: h.marcar }));
vi.mock("@/lib/channels/pos-entrada", () => ({ aplicarEfeitosPosEntrada: h.posEntrada }));
vi.mock("@/lib/channels/contato-por-telefone", () => ({ encontrarContatoPorTelefone: async () => null }));
vi.mock("@/lib/channels/meta/app", () => ({
  appDaMeta: async () => ({ appSecret: SEGREDO, verifyToken: "token-de-verificacao" }),
}));
vi.mock("@/lib/supabase/admin", () => {
  const consulta = () => {
    const q = {
      select: () => q,
      eq: (coluna: string, valor: unknown) => {
        h.filtros.push([coluna, valor]);
        return q;
      },
      is: () => q,
      maybeSingle: async () => ({ data: h.sessoes[0] ?? null, error: null }),
      then: (ok: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: h.sessoes, error: null }).then(ok),
    };
    return q;
  };
  return {
    createAdminClient: () => ({
      rpc: async (fn: string) =>
        fn === "fn_upsert_wa_contact"
          ? { data: "contato-1", error: null }
          : fn === "fn_upsert_wa_conversation"
            ? { data: "conversa-1", error: null }
            : { data: null, error: null },
      from: (tabela: string) =>
        tabela === "messages"
          ? {
              insert: (linha: Record<string, unknown>) => {
                h.inseridas.push(linha);
                return {
                  select: () => ({
                    maybeSingle: async () =>
                      h.erroDoInsert ? { data: null, error: h.erroDoInsert } : { data: { id: "msg-1" }, error: null },
                  }),
                };
              },
            }
          : consulta(),
    }),
  };
});

const eco = (extra: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "waba1",
      changes: [
        {
          field: "smb_message_echoes",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "5531999998888", phone_number_id: "num1" },
            message_echoes: [
              { from: "5531999998888", to: "5511988887777", id: "wamid.ECO1", timestamp: "1791000000", type: "text", text: { body: "Oi, é o dono falando" }, ...extra },
            ],
          },
        },
      ],
    },
  ],
});

const postNoApp = async (corpo: unknown, assinatura?: string) => {
  const bruto = JSON.stringify(corpo);
  const { POST } = await import("@/app/api/v1/webhooks/meta/route");
  return POST(
    new NextRequest("http://localhost/api/v1/webhooks/meta", {
      method: "POST",
      body: bruto,
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": assinatura ?? `sha256=${createHmac("sha256", SEGREDO).update(bruto, "utf8").digest("hex")}`,
      },
    }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  h.sessoes = [{ id: "canal-1", organization_id: ORG, meta_waba_id: "waba1" }];
  h.filtros.length = 0;
  h.inseridas.length = 0;
  h.erroDoInsert = null;
});

describe("o aviso de mensagem enviada pelo celular", () => {
  it("vira evento de SAÍDA, com o contato em `to` e o nosso número no metadata", async () => {
    const { parseMetaWebhook } = await import("@/lib/channels/meta/webhook");
    expect(parseMetaWebhook(eco())).toEqual([
      expect.objectContaining({
        kind: "outbound_echo",
        wabaId: "waba1",
        phoneNumberId: "num1",
        externalId: "wamid.ECO1",
        to: "5511988887777",
        type: "text",
        text: "Oi, é o dono falando",
        media: null,
      }),
    ]);
  });

  it("eco sem id ou sem destinatário não vira evento", async () => {
    const { parseMetaWebhook } = await import("@/lib/channels/meta/webhook");
    expect(parseMetaWebhook(eco({ to: undefined }))).toEqual([]);
  });
});

describe("POST /api/v1/webhooks/meta — a URL do app", () => {
  it("⭐ grava a mensagem do celular como saída por fora do CRM e pausa o agente na conversa", async () => {
    const res = await postNoApp(eco());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1, outcomes: ["ingested"] });
    expect(h.inseridas).toHaveLength(1);
    expect(h.inseridas[0]).toMatchObject({
      organization_id: ORG,
      conversation_id: "conversa-1",
      channel_session_id: "canal-1",
      direction: "outbound",
      sent_via: "external_device",
      body: "Oi, é o dono falando",
      external_id: "wamid.ECO1",
    });
    expect(h.pausar).toHaveBeenCalledWith(expect.anything(), {
      organizationId: ORG,
      conversationId: "conversa-1",
      canal: "meta",
    });
    expect(h.marcar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ direction: "outbound" }));
  });

  it("quem falou foi o negócio: nenhum efeito de entrada (lead, despacho do agente)", async () => {
    await postNoApp(eco());
    expect(h.posEntrada).not.toHaveBeenCalled();
  });

  it("a sessão é achada pelo NÚMERO do aviso, não pela conta", async () => {
    await postNoApp(eco());
    expect(h.filtros).toContainEqual(["meta_phone_number_id", "num1"]);
  });

  it("re-entrega da Meta não duplica nem renova a pausa", async () => {
    h.erroDoInsert = { code: "23505", message: "duplicate key" };

    const res = await postNoApp(eco());

    expect(await res.json()).toEqual({ received: 1, outcomes: ["duplicate"] });
    expect(h.pausar).not.toHaveBeenCalled();
  });

  it("número que ninguém conectou aqui: 200 e nada gravado", async () => {
    h.sessoes = [];

    const res = await postNoApp(eco());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1, outcomes: ["no_session"] });
    expect(h.inseridas).toHaveLength(0);
  });

  it("assinatura errada: 401 antes de ler qualquer coisa", async () => {
    const res = await postNoApp(eco(), "sha256=" + "0".repeat(64));

    expect(res.status).toBe(401);
    expect(h.inseridas).toHaveLength(0);
  });

  it("handshake: devolve o desafio em texto puro só com o token da instalação", async () => {
    const { GET } = await import("@/app/api/v1/webhooks/meta/route");
    const url = (token: string) =>
      new NextRequest(`http://localhost/api/v1/webhooks/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=12345`);

    const certo = await GET(url("token-de-verificacao"));
    expect(certo.status).toBe(200);
    expect(await certo.text()).toBe("12345");
    expect((await GET(url("outro"))).status).toBe(403);
  });
});
