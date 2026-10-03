/**
 * Telegram — o provider novo entrou em TODOS os lugares do seam, e o banco
 * conhece o vocabulário (inclusive o canal da conversa).
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/channels";
import { acceptsInboundWebhook, verifyInboundWebhookSignature } from "@/lib/channels/inbound";
import { CANAIS_DE_CONVERSA, ehCanalDeConversa } from "@/lib/channels/canais-de-conversa";
import { CHANNEL_PROVIDER_TELEGRAM, capabilitiesOf, transportaMensagem } from "@/lib/channels/capabilities";
import { channelBrand } from "@/lib/channels/presentation";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef } from "@/lib/channels/session-ref";
import { SOCIAL_NETWORKS } from "@/lib/channels/social/catalog";
import { fonteDeTemplates } from "@/lib/channels/templates-fonte";

const TELEGRAM = "telegram_bot" as const;
const MIGRATION = "supabase/migrations/20261003120000_0912_canal_telegram.sql";

describe("canal Telegram — vocabulário e seam", () => {
  it("fala a qualquer hora, sem modelo, sem custo e sem grupo", () => {
    const caps = capabilitiesOf(CHANNEL_PROVIDER_TELEGRAM);
    expect(caps.freeformOutsideWindow).toBe(true);
    expect(caps.requiresTemplates).toBe(false);
    expect(caps.costPerMessage).toBe(false);
    expect(caps.banRisk).toBe(false);
    expect(caps.groups).toBe("none");
    expect(fonteDeTemplates(TELEGRAM)).toBeNull();
  });

  it("é canal de mensagem, aparece como Telegram e é canal de CONVERSA nativo", () => {
    expect(transportaMensagem(TELEGRAM)).toBe(true);
    expect(channelBrand({ provider: TELEGRAM })).toBe("telegram");
    expect(ehCanalDeConversa("telegram")).toBe(true);
    // Nativo, e não pelo catálogo do intermediário: lá o Telegram segue sem inbox.
    expect(SOCIAL_NETWORKS.find((n) => n.id === "telegram")?.inbox).toBe(false);
    expect(CANAIS_DE_CONVERSA).toContain("telegram");
  });

  it("o sessionRef é o id do bot, e a coluna entra no select", () => {
    expect(resolveSessionRef({ provider: TELEGRAM, telegram_bot_id: "7012345678" })).toBe("7012345678");
    expect(CHANNEL_SESSION_REF_COLUMNS).toContain("telegram_bot_id");
  });

  it("entra pela rota genérica, autenticado pelo segredo no cabeçalho", () => {
    const segredo = "s".repeat(64);
    expect(acceptsInboundWebhook(TELEGRAM)).toBe(true);
    const com = new Headers({ "x-telegram-bot-api-secret-token": segredo });
    expect(verifyInboundWebhookSignature(TELEGRAM, "{}", com, segredo)).toBe(true);
    expect(verifyInboundWebhookSignature(TELEGRAM, "{}", new Headers({ "x-telegram-bot-api-secret-token": "outro" }), segredo)).toBe(false);
    expect(verifyInboundWebhookSignature(TELEGRAM, "{}", new Headers(), segredo)).toBe(false);
  });

  it("o adapter existe, endereça pela thread, e os códigos carregam o nome", () => {
    const adapter = getAdapter(TELEGRAM);
    expect(adapter.provider).toBe(TELEGRAM);
    expect(adapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null })).toBe("provider-thread");
    expect(adapter.codes.sendFailed).toContain("telegram");
  });

  it("migration e baseline conhecem o provider, o ramo do CHECK, o arquivo do webhook, o canal e o índice", () => {
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    expect(baseline).toMatch(/channel_sessions_provider_check[\s\S]{0,700}'telegram_bot'::text/);
    expect(baseline).toMatch(/provider = 'telegram_bot' and telegram_bot_id is not null/);
    expect(baseline).toMatch(/webhook_events_log_provider_check check \(provider in \([^)]*'telegram_bot'/);
    expect(baseline).toMatch(/check \(channel in \('whatsapp', 'instagram', 'facebook', 'telegram'\)\)/);
    expect(baseline).toContain("channel_sessions_telegram_bot_id_ativo_unique");
    expect(baseline.indexOf("add column if not exists telegram_bot_id")).toBeLessThan(baseline.indexOf("(provider = 'telegram_bot'"));

    const mig = readFileSync(MIGRATION, "utf8");
    expect(mig).toContain("add column if not exists telegram_bot_id");
    expect(mig).toContain("'telegram'");
    expect(readFileSync("supabase/migrations/MANIFEST.md", "utf8")).toContain("`0912_canal_telegram`");
  });
});
