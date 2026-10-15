import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * COEXISTÊNCIA, a parte que acontece FORA do CRM:
 *
 *   - a agenda do celular chega (`smb_app_state_sync`) e vira contato, sem
 *     conversa, lead nem agente;
 *   - o cliente desconecta pelo celular (`account_update`) e o canal deixa de
 *     dizer "conectado" — com aviso na Central, que fecha quando ele volta;
 *   - o pedido da agenda à Meta, que só vale uma vez.
 */

const h = vi.hoisted(() => ({
  saude: vi.fn(),
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  erroDaRpc: null as { message: string } | null,
  updates: [] as { tabela: string; patch: Record<string, unknown>; filtros: [string, unknown][] }[],
  canal: { display_name: "Loja Centro", phone_number: "+5511999990000" } as Record<string, unknown> | null,
}));

vi.mock("@/lib/channels/health", () => ({ sincronizarSaudeDaConexao: h.saude }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/channels/meta/ingest", () => ({ ingestMetaInbound: vi.fn(), ingestMetaEcho: vi.fn() }));

import { aplicarEventoDaMeta, DESFECHO_PASSAGEIRO } from "@/lib/channels/meta/aplicar-evento";
import { pedirAgendaDoAplicativo } from "@/lib/channels/meta/cadastro-incorporado";
import type { MetaWebhookSession } from "@/lib/channels/meta/session";
import { parseMetaWebhook, type MetaWebhookEnvelope } from "@/lib/channels/meta/webhook";
import { CAMPOS_DO_WEBHOOK_DO_APP } from "@/lib/channels/meta/webhook-do-app";

const sessao: MetaWebhookSession = { id: "sess-1", organizationId: "org-1", wabaId: "waba-1" };
const AGORA = "2026-10-15T18:00:00.000Z";

function adminFalso() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      return { data: h.erroDaRpc ? null : "contato-1", error: h.erroDaRpc };
    },
    from: (tabela: string) => {
      const registro = { tabela, patch: {} as Record<string, unknown>, filtros: [] as [string, unknown][] };
      const q = {
        update: (patch: Record<string, unknown>) => {
          registro.patch = patch;
          h.updates.push(registro);
          return q;
        },
        eq: (coluna: string, valor: unknown) => {
          registro.filtros.push([coluna, valor]);
          return q;
        },
        select: () => q,
        maybeSingle: async () => ({ data: h.canal, error: null }),
      };
      return q;
    },
  } as never;
}

function envelope(field: string, value: Record<string, unknown>, id = "waba-1"): MetaWebhookEnvelope {
  return { object: "whatsapp_business_account", entry: [{ id, changes: [{ field, value }] }] } as MetaWebhookEnvelope;
}

beforeEach(() => {
  h.saude.mockReset();
  h.rpcs = [];
  h.updates = [];
  h.erroDaRpc = null;
  h.canal = { display_name: "Loja Centro", phone_number: "+5511999990000" };
});

describe("o app assina o que a coexistência precisa", () => {
  it("⭐ agenda do celular e mudança da conta entram na assinatura do app", () => {
    expect(CAMPOS_DO_WEBHOOK_DO_APP).toContain("smb_app_state_sync");
    expect(CAMPOS_DO_WEBHOOK_DO_APP).toContain("account_update");
  });

  it("o histórico NÃO é assinado ainda: sem ingestão, os 180 dias seriam jogados fora", () => {
    expect(CAMPOS_DO_WEBHOOK_DO_APP).not.toContain("history");
  });
});

describe("leitura do aviso `smb_app_state_sync`", () => {
  it("⭐ cada contato vira item com telefone em dígitos, nome e ação", () => {
    const eventos = parseMetaWebhook(
      envelope("smb_app_state_sync", {
        metadata: { phone_number_id: "pn-1" },
        state_sync: [
          { type: "contact", contact: { full_name: "Pablo Morales", first_name: "Pablo", phone_number: "+1 650 555 1234" }, action: "add" },
          { type: "contact", contact: { phone_number: "5511988887777" }, action: "remove" },
        ],
      }),
    );
    expect(eventos).toEqual([
      {
        kind: "contact_sync",
        wabaId: "waba-1",
        phoneNumberId: "pn-1",
        contatos: [
          { telefone: "16505551234", nome: "Pablo Morales", acao: "add" },
          { telefone: "5511988887777", nome: null, acao: "remove" },
        ],
      },
    ]);
  });

  it("item sem telefone, de outro tipo ou com ação desconhecida é descartado", () => {
    const eventos = parseMetaWebhook(
      envelope("smb_app_state_sync", {
        metadata: { phone_number_id: "pn-1" },
        state_sync: [
          { type: "contact", contact: { full_name: "Sem número" }, action: "add" },
          { type: "label", contact: { phone_number: "551100" }, action: "add" },
          { type: "contact", contact: { phone_number: "551100" }, action: "merge" },
        ],
      }),
    );
    expect(eventos).toEqual([]);
  });
});

describe("leitura do aviso `account_update`", () => {
  it("⭐ PARTNER_REMOVED traz a conta de `waba_info` e o motivo do desligamento", () => {
    const eventos = parseMetaWebhook(
      envelope(
        "account_update",
        {
          event: "PARTNER_REMOVED",
          waba_info: { waba_id: "waba-9", owner_business_id: "bm-1" },
          disconnection_info: { reason: "PRIMARY_INACTIVITY", initiated_by: "SYSTEM" },
        },
        "entry-9",
      ),
    );
    expect(eventos).toEqual([
      { kind: "account_update", wabaId: "waba-9", evento: "PARTNER_REMOVED", motivo: "PRIMARY_INACTIVITY", iniciadoPor: "SYSTEM" },
    ]);
  });

  it("ACCOUNT_OFFBOARDED e ACCOUNT_RECONNECTED usam a conta do `entry.id`", () => {
    const [saiu] = parseMetaWebhook(envelope("account_update", { event: "ACCOUNT_OFFBOARDED" }));
    const [voltou] = parseMetaWebhook(envelope("account_update", { event: "ACCOUNT_RECONNECTED" }));
    expect(saiu).toMatchObject({ kind: "account_update", wabaId: "waba-1", evento: "ACCOUNT_OFFBOARDED" });
    expect(voltou).toMatchObject({ kind: "account_update", wabaId: "waba-1", evento: "ACCOUNT_RECONNECTED" });
  });

  it("outros eventos da conta (verificação, limite) não mexem no canal", () => {
    expect(parseMetaWebhook(envelope("account_update", { event: "VERIFIED_ACCOUNT" }))).toEqual([]);
  });
});

describe("aplicar a agenda do celular", () => {
  const agenda = {
    kind: "contact_sync",
    wabaId: "waba-1",
    phoneNumberId: "pn-1",
    contatos: [
      { telefone: "5511988887777", nome: "Ana", acao: "add" },
      { telefone: "5511977776666", nome: null, acao: "remove" },
    ],
  } as const;

  it("⭐ grava o contato pelo upsert de sempre, com o nome do celular", async () => {
    const desfecho = await aplicarEventoDaMeta(adminFalso(), agenda as never, sessao, AGORA);
    expect(desfecho).toBe("contacts_synced");
    expect(h.rpcs).toEqual([
      {
        fn: "fn_upsert_wa_contact",
        args: { p_org: "org-1", p_kind: "phone", p_phone: "+5511988887777", p_lid: null, p_chat_id: "5511988887777", p_notify: "Ana" },
      },
    ]);
  });

  it("⭐ contato salvo no celular não abre conversa nem acorda ninguém", async () => {
    await aplicarEventoDaMeta(adminFalso(), agenda as never, sessao, AGORA);
    expect(h.rpcs.map((r) => r.fn)).not.toContain("fn_upsert_wa_conversation");
    expect(h.updates).toEqual([]);
  });

  it("apagado da agenda do celular não apaga o contato do CRM", async () => {
    const soRemocao = { ...agenda, contatos: [agenda.contatos[1]] };
    expect(await aplicarEventoDaMeta(adminFalso(), soRemocao as never, sessao, AGORA)).toBe("contacts_skipped");
    expect(h.rpcs).toEqual([]);
  });

  it("banco sem conexão pede a re-entrega à Meta", async () => {
    h.erroDaRpc = { message: "Timed out acquiring connection from connection pool" };
    expect(await aplicarEventoDaMeta(adminFalso(), agenda as never, sessao, AGORA)).toBe(DESFECHO_PASSAGEIRO);
  });
});

describe("aplicar a mudança da conta", () => {
  const removido = {
    kind: "account_update",
    wabaId: "waba-1",
    evento: "PARTNER_REMOVED",
    motivo: "ACCOUNT_DISCONNECTED",
    iniciadoPor: "USER",
  } as const;

  it("⭐ cliente desconectou: o canal fica parado e a Central é avisada pelo vigia, como empurrão", async () => {
    const desfecho = await aplicarEventoDaMeta(adminFalso(), removido as never, sessao, AGORA);
    expect(desfecho).toBe("account_disconnected");
    expect(h.updates).toEqual([
      {
        tabela: "channel_sessions",
        patch: { status: "STOPPED", updated_at: AGORA },
        filtros: [
          ["organization_id", "org-1"],
          ["id", "sess-1"],
        ],
      },
    ]);
    expect(h.saude).toHaveBeenCalledWith(
      expect.anything(),
      { id: "sess-1", organization_id: "org-1", status: "STOPPED" },
      { reachable: true, status: "STOPPED", detail: "PARTNER_REMOVED · ACCOUNT_DISCONNECTED · USER" },
      "Loja Centro",
      "empurrao",
    );
  });

  it("⭐ voltou: o canal fica no ar e o vigia fecha o aviso", async () => {
    const voltou = { ...removido, evento: "ACCOUNT_RECONNECTED", motivo: null, iniciadoPor: null };
    expect(await aplicarEventoDaMeta(adminFalso(), voltou as never, sessao, AGORA)).toBe("account_reconnected");
    expect(h.updates[0]?.patch).toEqual({ status: "WORKING", updated_at: AGORA });
    expect(h.saude).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: "WORKING" }),
      { reachable: true, status: "WORKING", detail: null },
      "Loja Centro",
      "empurrao",
    );
  });
});

describe("pedirAgendaDoAplicativo", () => {
  function resposta(status: number, corpo: unknown) {
    return vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
  }

  it("⭐ pede a agenda (e só a agenda) com o token no cabeçalho, nunca na URL", async () => {
    const buscar = resposta(200, { success: true });
    expect(await pedirAgendaDoAplicativo({ phoneNumberId: "pn-1", token: "tok-secreto" }, buscar as never)).toEqual({
      ok: true,
      jaPedida: false,
    });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/pn-1\/smb_app_data$/);
    expect(url).not.toContain("tok-secreto");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-secreto");
    expect(JSON.parse(String(init.body))).toEqual({ messaging_product: "whatsapp", sync_type: "smb_app_state_sync" });
  });

  it("135000 (já pedida antes, numa reconexão) não é falha", async () => {
    const buscar = resposta(400, { error: { code: 135000, message: "already requested" } });
    expect(await pedirAgendaDoAplicativo({ phoneNumberId: "pn-1", token: "t" }, buscar as never)).toEqual({
      ok: true,
      jaPedida: true,
    });
  });

  it("recusa da Meta volta com o motivo dela", async () => {
    const buscar = resposta(400, { error: { code: 100, message: "x", error_data: { details: "fora da janela de 24 h" } } });
    expect(await pedirAgendaDoAplicativo({ phoneNumberId: "pn-1", token: "t" }, buscar as never)).toEqual({
      ok: false,
      motivo: "fora da janela de 24 h",
    });
  });
});
