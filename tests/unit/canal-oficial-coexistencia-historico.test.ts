import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * COEXISTÊNCIA: o histórico do celular (aviso `history`).
 *
 *   - a leitura do aviso separa quem falou (contato x negócio pelo celular) e
 *     traz cada tipo para o vocabulário do banco;
 *   - a recusa do negócio em compartilhar não vira conversa nenhuma;
 *   - a gravação é UMA chamada por contato, a `fn_importar_historico_da_conversa`
 *     — a que não emite `message.received`, não abre demanda e não reabre
 *     conversa (migration 0929). Nada de `messages` direto, nada de lead;
 *   - o pedido à Meta sai com `sync_type: "history"`.
 */

const h = vi.hoisted(() => ({
  rpcs: [] as { fn: string; args: Record<string, unknown> }[],
  erroDaImportacao: null as { message: string } | null,
  sessao: { id: "canal-1", organization_id: "org-1" } as { id: string; organization_id: string } | null,
  tabelasTocadas: [] as string[],
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/channels/contato-por-telefone", () => ({ encontrarContatoPorTelefone: vi.fn(async () => null) }));
vi.mock("@/lib/channels/meta/ingest", () => ({
  ingestMetaInbound: vi.fn(),
  ingestMetaEcho: vi.fn(),
  sessionByPhoneNumberId: vi.fn(async () => h.sessao),
}));

import { aplicarEventoDaMeta, DESFECHO_PASSAGEIRO } from "@/lib/channels/meta/aplicar-evento";
import { pedirHistoricoDoAplicativo } from "@/lib/channels/meta/cadastro-incorporado";
import { ingestMetaHistorico, linhasDoHistorico } from "@/lib/channels/meta/historico";
import type { MetaWebhookSession } from "@/lib/channels/meta/session";
import {
  parseMetaWebhook,
  type HistorySyncEvent,
  type MetaWebhookEnvelope,
} from "@/lib/channels/meta/webhook";

const sessao: MetaWebhookSession = { id: "canal-1", organizationId: "org-1", wabaId: "waba-1" };
const NEGOCIO = "5511999990000";
const CONTATO = "5511988887777";

function adminFalso() {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      h.rpcs.push({ fn, args });
      if (fn === "fn_upsert_wa_contact") return { data: `contato-${String(args.p_chat_id)}`, error: null };
      if (h.erroDaImportacao) return { data: null, error: h.erroDaImportacao };
      const lote = args.p_mensagens as unknown[];
      return { data: [{ conversation_id: "conversa-1", inseridas: lote.length }], error: null };
    },
    from: (tabela: string) => {
      h.tabelasTocadas.push(tabela);
      throw new Error(`a importação não pode escrever em ${tabela} direto`);
    },
  } as never;
}

function aviso(history: unknown[]): MetaWebhookEnvelope {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "history",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: NEGOCIO, phone_number_id: "pn-1" },
              history,
            },
          },
        ],
      },
    ],
  } as MetaWebhookEnvelope;
}

const pedacoComDuasConversas = {
  metadata: { phase: 1, chunk_order: 1, progress: 40 },
  threads: [
    {
      id: CONTATO,
      messages: [
        {
          from: CONTATO,
          id: "wamid.1",
          timestamp: "1752000000",
          type: "text",
          text: { body: "Oi, ainda tem horário amanhã?" },
          history_context: { status: "READ" },
        },
        {
          from: NEGOCIO,
          to: CONTATO,
          id: "wamid.2",
          timestamp: "1752000300",
          type: "image",
          image: { id: "midia-9", mime_type: "image/jpeg", caption: "Tabela de preços" },
          history_context: { status: "READ" },
        },
        { from: CONTATO, id: "wamid.3", timestamp: "1752000400", type: "media_placeholder" },
        { from: CONTATO, id: "", timestamp: "1752000500", type: "text", text: { body: "sem id" } },
      ],
    },
    {
      id: "5521977776666",
      messages: [
        {
          from: NEGOCIO,
          id: "wamid.4",
          timestamp: "1751000000",
          type: "text",
          text: { body: "Seu pedido saiu" },
          history_context: { status: "DELIVERED" },
        },
      ],
    },
    { id: "5531900000000", messages: [] },
  ],
};

beforeEach(() => {
  h.rpcs = [];
  h.erroDaImportacao = null;
  h.sessao = { id: "canal-1", organization_id: "org-1" };
  h.tabelasTocadas = [];
});

describe("leitura do aviso `history`", () => {
  it("⭐ separa quem falou pela conversa: o contato é inbound, o negócio pelo celular é outbound", () => {
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    expect(e).toMatchObject({ kind: "history_sync", phoneNumberId: "pn-1", fase: 1, progresso: 40, recusa: null });
    expect(e!.conversas.map((c) => c.contato)).toEqual([CONTATO, "5521977776666"]);

    const [oi, foto, semConteudo] = e!.conversas[0]!.mensagens;
    expect(oi).toMatchObject({ externalId: "wamid.1", direcao: "inbound", type: "text", status: "delivered" });
    expect(oi!.text).toBe("Oi, ainda tem horário amanhã?");
    expect(oi!.sentAt.toISOString()).toBe(new Date(1752000000 * 1000).toISOString());
    expect(foto).toMatchObject({
      direcao: "outbound",
      type: "image",
      text: "Tabela de preços",
      mime: "image/jpeg",
      mediaId: "midia-9",
      status: "read",
    });
    // Tipo sem coluna no CRM vira nota, sem inventar conteúdo.
    expect(semConteudo).toMatchObject({ type: "system", mediaId: null });
    expect(semConteudo!.text).toContain("media_placeholder");
  });

  it("mensagem sem id é descartada, e conversa sem mensagem não vira conversa", () => {
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    expect(e!.conversas[0]!.mensagens).toHaveLength(3);
    expect(e!.conversas.some((c) => c.contato === "5531900000000")).toBe(false);
  });

  it("o negócio que recusou compartilhar chega como recusa, sem conversa", () => {
    const eventos = parseMetaWebhook(
      aviso([{ errors: [{ code: 2593109, title: "History sharing is turned off by the business" }] }]),
    );
    expect(eventos).toEqual([
      {
        kind: "history_sync",
        wabaId: "waba-1",
        phoneNumberId: "pn-1",
        fase: null,
        progresso: null,
        conversas: [],
        recusa: { codigo: 2593109, titulo: "History sharing is turned off by the business" },
      },
    ]);
  });
});

describe("gravação do histórico", () => {
  it("⭐ uma chamada à função de importação por contato, e nada escrito em tabela direto", async () => {
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    expect(await ingestMetaHistorico(adminFalso(), e!, sessao)).toEqual({
      status: "imported",
      conversas: 2,
      mensagens: 4,
    });
    expect(h.tabelasTocadas).toEqual([]);

    const importacoes = h.rpcs.filter((r) => r.fn === "fn_importar_historico_da_conversa");
    expect(importacoes).toHaveLength(2);
    expect(importacoes[0]!.args).toMatchObject({ p_org: "org-1", p_session: "canal-1", p_contact: `contato-${CONTATO}` });
    // O contato nasce sem nome: o histórico não traz o perfil.
    expect(h.rpcs.find((r) => r.fn === "fn_upsert_wa_contact")!.args).toMatchObject({ p_phone: `+${CONTATO}`, p_notify: null });
  });

  it("o lote vai no formato que a função lê, com a mídia só como ponteiro", () => {
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    const linhas = linhasDoHistorico(e!.conversas[0]!.mensagens);
    expect(linhas[1]).toEqual({
      external_id: "wamid.2",
      direction: "outbound",
      type: "image",
      body: "Tabela de preços",
      sent_at: new Date(1752000300 * 1000).toISOString(),
      status: "read",
      media_mime: "image/jpeg",
      metadata: { meta_media_id: "midia-9" },
    });
    expect(linhas[0]!.metadata).toEqual({});
  });

  it("recusa do negócio não grava nada", async () => {
    const [e] = parseMetaWebhook(aviso([{ errors: [{ code: 2593109 }] }])) as HistorySyncEvent[];
    expect(await aplicarEventoDaMeta(adminFalso(), e!, sessao, "2026-10-15T18:00:00.000Z")).toBe("history_declined");
    expect(h.rpcs).toEqual([]);
  });

  it("número que não é desta organização não grava nada", async () => {
    h.sessao = null;
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    expect(await aplicarEventoDaMeta(adminFalso(), e!, sessao, "2026-10-15T18:00:00.000Z")).toBe("no_session");
    expect(h.rpcs).toEqual([]);
  });

  it("banco sem conexão livre pede re-entrega; erro definitivo não", async () => {
    const [e] = parseMetaWebhook(aviso([pedacoComDuasConversas])) as HistorySyncEvent[];
    h.erroDaImportacao = { message: "Timed out acquiring connection from connection pool" };
    expect(await aplicarEventoDaMeta(adminFalso(), e!, sessao, "2026-10-15T18:00:00.000Z")).toBe(DESFECHO_PASSAGEIRO);
    h.erroDaImportacao = { message: "historico_scope_mismatch" };
    expect(await aplicarEventoDaMeta(adminFalso(), e!, sessao, "2026-10-15T18:00:00.000Z")).toBe("failed");
  });
});

describe("pedirHistoricoDoAplicativo", () => {
  it("⭐ pede o histórico com o token no cabeçalho, nunca na URL", async () => {
    const buscar = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    expect(await pedirHistoricoDoAplicativo({ phoneNumberId: "pn-1", token: "tok-secreto" }, buscar as never)).toEqual({
      ok: true,
      jaPedida: false,
    });
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/pn-1\/smb_app_data$/);
    expect(url).not.toContain("tok-secreto");
    expect(JSON.parse(String(init.body))).toEqual({ messaging_product: "whatsapp", sync_type: "history" });
  });
});
