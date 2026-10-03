import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../zernio/ingest", () => ({ ingestZernioInbound: vi.fn() }));
vi.mock("./api", () => ({ confirmarToque: vi.fn() }));
vi.mock("@/lib/webhooks/secrets", () => ({ decryptWebhookSecret: vi.fn(async (_d: unknown, c: string) => c), encryptWebhookSecret: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { ingestZernioInbound } from "../zernio/ingest";
import { confirmarToque } from "./api";
import { ingerirAtualizacao, segredoDoTelegramConfere } from "./ingest";

const sessao = { id: "s1", organization_id: "org-1" };
const linha = {
  id: "s1",
  organization_id: "org-1",
  provider: "telegram_bot",
  telegram_bot_id: "7012345678",
  telegram_bot_token_encrypted: "o-token",
  archived_at: null,
};
const texto = JSON.stringify({ update_id: 1, message: { message_id: 5, chat: { id: 9, type: "private" }, from: { id: 9, first_name: "Ana" }, text: "oi" } });

beforeEach(() => {
  vi.mocked(ingestZernioInbound).mockReset().mockResolvedValue({ status: "ingested", conversationId: "c1" });
  vi.mocked(confirmarToque).mockReset().mockResolvedValue();
});

describe("ingerirAtualizacao", () => {
  it("mensagem privada entra pelo ramo social compartilhado, como canal telegram", async () => {
    const b = criarBancoEmMemoria({ channel_sessions: [linha] });
    await expect(ingerirAtualizacao(b.cliente as unknown as SupabaseClient, sessao, texto)).resolves.toMatchObject({ status: "ingested" });
    const chamada = vi.mocked(ingestZernioInbound).mock.calls[0]?.[1];
    expect(chamada).toMatchObject({ organizationId: "org-1", channelSessionId: "s1" });
    expect(chamada?.socialMessage).toMatchObject({ platform: "telegram", conversationId: "9", accountId: "7012345678" });
  });

  it("toque em botão é confirmado ao Telegram — e uma falha ali não impede a mensagem", async () => {
    vi.mocked(confirmarToque).mockRejectedValue(new Error("rede"));
    const b = criarBancoEmMemoria({ channel_sessions: [linha] });
    const toque = JSON.stringify({
      update_id: 2,
      callback_query: { id: "q1", from: { id: 9 }, data: "A", message: { message_id: 6, chat: { id: 9, type: "private" }, reply_markup: { inline_keyboard: [[{ text: "Opção A", callback_data: "A" }]] } } },
    });
    await expect(ingerirAtualizacao(b.cliente as unknown as SupabaseClient, sessao, toque)).resolves.toMatchObject({ status: "ingested" });
    expect(confirmarToque).toHaveBeenCalledWith({ token: "o-token", callbackQueryId: "q1" });
    expect(vi.mocked(ingestZernioInbound).mock.calls[0]?.[1].socialMessage?.text).toBe("Opção A");
  });

  it("sessão arquivada, JSON inválido e grupo não gravam nada", async () => {
    const arquivada = criarBancoEmMemoria({ channel_sessions: [{ ...linha, archived_at: "2026-10-01T00:00:00Z" }] });
    await expect(ingerirAtualizacao(arquivada.cliente as unknown as SupabaseClient, sessao, texto)).resolves.toMatchObject({ status: "ignored" });
    const b = criarBancoEmMemoria({ channel_sessions: [linha] });
    await expect(ingerirAtualizacao(b.cliente as unknown as SupabaseClient, sessao, "{")).resolves.toMatchObject({ reason: "json_invalido" });
    const grupo = JSON.stringify({ update_id: 3, message: { message_id: 1, chat: { id: -5, type: "group" }, from: { id: 9 }, text: "oi" } });
    await expect(ingerirAtualizacao(b.cliente as unknown as SupabaseClient, sessao, grupo)).resolves.toMatchObject({ status: "ignored" });
    expect(ingestZernioInbound).not.toHaveBeenCalled();
  });
});

describe("segredoDoTelegramConfere", () => {
  it("só o segredo exato passa; ausência de qualquer lado recusa", () => {
    expect(segredoDoTelegramConfere("abc", "abc")).toBe(true);
    expect(segredoDoTelegramConfere("abd", "abc")).toBe(false);
    expect(segredoDoTelegramConfere("abcd", "abc")).toBe(false);
    expect(segredoDoTelegramConfere(null, "abc")).toBe(false);
    expect(segredoDoTelegramConfere("abc", null)).toBe(false);
  });
});
