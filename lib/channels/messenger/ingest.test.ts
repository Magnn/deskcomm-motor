import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../zernio/ingest", () => ({ ingestZernioInbound: vi.fn() }));
vi.mock("./api", () => ({ lerPerfil: vi.fn() }));
vi.mock("@/lib/webhooks/secrets", () => ({
  decryptWebhookSecret: vi.fn(async (_db: unknown, c: string) => c),
  encryptWebhookSecret: vi.fn(async (_db: unknown, t: string) => t),
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { ingestZernioInbound } from "../zernio/ingest";
import { lerPerfil } from "./api";
import { ingerirAviso, ingerirEvento } from "./ingest";
import { eventosDoAviso, externalIdDoMessenger } from "./parser";

const PAGINA = "pg-1";
const PESSOA = "psid-1";
const SESSAO = { id: "s1", organizationId: "org-1" };

const sessaoAtiva = {
  id: "s1",
  organization_id: "org-1",
  provider: "meta_messenger",
  messenger_page_id: PAGINA,
  messenger_page_token_encrypted: "token-da-pagina",
  archived_at: null,
};

const entrada = (mid = "m_1") =>
  eventosDoAviso(
    { object: "page", entry: [{ id: PAGINA, messaging: [{ sender: { id: PESSOA }, recipient: { id: PAGINA }, message: { mid, text: "oi" } }] }] },
    "app",
  );

describe("ingerirEvento — mensagem", () => {
  beforeEach(() => {
    vi.mocked(ingestZernioInbound).mockReset().mockResolvedValue({ status: "ingested", conversationId: "c1", messageId: "msg1" });
    vi.mocked(lerPerfil).mockReset().mockResolvedValue({ nome: "Maria Souza", fotoUrl: null });
  });

  it("pessoa nova: o nome vem do perfil e a gravação é a do caminho social compartilhado", async () => {
    const b = criarBancoEmMemoria({ channel_sessions: [sessaoAtiva], contacts: [] });
    const [evento] = entrada();
    const r = await ingerirEvento(b.cliente as unknown as SupabaseClient, SESSAO, evento!);
    expect(r).toEqual({ status: "ingested", conversationId: "c1" });
    expect(lerPerfil).toHaveBeenCalledWith(PESSOA, "token-da-pagina");
    const chamada = vi.mocked(ingestZernioInbound).mock.calls[0]?.[1];
    expect(chamada?.organizationId).toBe("org-1");
    expect(chamada?.channelSessionId).toBe("s1");
    expect(chamada?.socialMessage?.identity.displayName).toBe("Maria Souza");
    expect(chamada?.socialMessage?.conversationId).toBe(PESSOA);
  });

  it("pessoa que já é contato não custa uma leitura de perfil por mensagem", async () => {
    const b = criarBancoEmMemoria({
      channel_sessions: [sessaoAtiva],
      contacts: [{ id: "ct1", organization_id: "org-1", social_identity: `facebook:${PAGINA}:${PESSOA}`, is_merged_into: null }],
    });
    const [evento] = entrada();
    await ingerirEvento(b.cliente as unknown as SupabaseClient, SESSAO, evento!);
    expect(lerPerfil).not.toHaveBeenCalled();
  });

  it("perfil fechado não segura o atendimento: o contato nasce sem nome", async () => {
    vi.mocked(lerPerfil).mockRejectedValue(new Error("(#100) perfil indisponível"));
    const b = criarBancoEmMemoria({ channel_sessions: [sessaoAtiva], contacts: [] });
    const [evento] = entrada();
    await expect(ingerirEvento(b.cliente as unknown as SupabaseClient, SESSAO, evento!)).resolves.toMatchObject({ status: "ingested" });
    expect(vi.mocked(ingestZernioInbound).mock.calls[0]?.[1].socialMessage?.identity.displayName).toBeNull();
  });
});

describe("ingerirEvento — desfechos", () => {
  it("entregue marca as mensagens pelos mids, sem rebaixar uma já lida", async () => {
    const b = criarBancoEmMemoria({
      messages: [
        { id: "a", organization_id: "org-1", channel_session_id: "s1", external_id: externalIdDoMessenger(PAGINA, "m_a"), status: "sent" },
        { id: "b", organization_id: "org-1", channel_session_id: "s1", external_id: externalIdDoMessenger(PAGINA, "m_b"), status: "read" },
      ],
    });
    await ingerirEvento(b.cliente as unknown as SupabaseClient, SESSAO, {
      tipo: "entregue",
      pageId: PAGINA,
      externalIds: [externalIdDoMessenger(PAGINA, "m_a"), externalIdDoMessenger(PAGINA, "m_b")],
    });
    expect(b.tabelas.messages?.map((m) => m.status)).toEqual(["delivered", "read"]);
  });

  it("lida marca as SAÍDAS da conversa até a marca d'água", async () => {
    const b = criarBancoEmMemoria({
      conversations: [{ id: "c1", organization_id: "org-1", channel_session_id: "s1", provider_conversation_id: PESSOA }],
      messages: [
        { id: "antes", organization_id: "org-1", conversation_id: "c1", direction: "outbound", status: "delivered", created_at: "2026-10-03T10:00:00.000Z" },
        { id: "depois", organization_id: "org-1", conversation_id: "c1", direction: "outbound", status: "sent", created_at: "2026-10-03T12:00:00.000Z" },
        { id: "entrada", organization_id: "org-1", conversation_id: "c1", direction: "inbound", status: "delivered", created_at: "2026-10-03T09:00:00.000Z" },
      ],
    });
    await ingerirEvento(b.cliente as unknown as SupabaseClient, SESSAO, { tipo: "lida", pageId: PAGINA, psid: PESSOA, ate: "2026-10-03T11:00:00.000Z" });
    expect(Object.fromEntries((b.tabelas.messages ?? []).map((m) => [m.id, m.status]))).toEqual({ antes: "read", depois: "sent", entrada: "delivered" });
  });
});

describe("ingerirAviso", () => {
  beforeEach(() => {
    vi.mocked(ingestZernioInbound).mockReset().mockResolvedValue({ status: "ingested", conversationId: "c1" });
    vi.mocked(lerPerfil).mockReset().mockResolvedValue({ nome: null, fotoUrl: null });
  });

  it("página que não é canal de ninguém é ignorada, sem arquivo e sem gravação", async () => {
    const b = criarBancoEmMemoria({ channel_sessions: [], webhook_events_log: [] });
    const r = await ingerirAviso(b.cliente as unknown as SupabaseClient, { rawBody: "{}", headers: new Headers(), eventos: entrada() });
    expect(r).toEqual({ processados: 0, ignorados: 1 });
    expect(ingestZernioInbound).not.toHaveBeenCalled();
    expect(b.tabelas.webhook_events_log).toHaveLength(0);
  });

  it("o corpo cru vai para o arquivo da sessão e fecha como processado", async () => {
    const b = criarBancoEmMemoria({ channel_sessions: [sessaoAtiva], contacts: [], webhook_events_log: [] });
    await ingerirAviso(b.cliente as unknown as SupabaseClient, { rawBody: '{"object":"page"}', headers: new Headers(), eventos: entrada() });
    const [arquivo] = b.tabelas.webhook_events_log ?? [];
    expect(arquivo).toMatchObject({ organization_id: "org-1", channel_session_id: "s1", provider: "meta_messenger", status: "processed" });
  });

  it("falha de ESCRITA sobe (a rota responde 500 e a Meta reentrega), e o arquivo fica com o erro", async () => {
    vi.mocked(ingestZernioInbound).mockRejectedValue(new Error("zernio_ingest_insert_failed: banco fora"));
    const b = criarBancoEmMemoria({ channel_sessions: [sessaoAtiva], contacts: [], webhook_events_log: [] });
    await expect(
      ingerirAviso(b.cliente as unknown as SupabaseClient, { rawBody: "{}", headers: new Headers(), eventos: entrada() }),
    ).rejects.toThrow("banco fora");
    expect(b.tabelas.webhook_events_log?.[0]?.status).toBe("error");
  });
});
