/**
 * Messenger direto — o provider novo entrou em TODOS os lugares do seam, e o
 * banco conhece o vocabulário. Mesmo molde de `canal-datafy-vocabulario`.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { getAdapter } from "@/lib/channels";
import { CHANNEL_PROVIDER_MESSENGER, capabilitiesOf, transportaMensagem } from "@/lib/channels/capabilities";
import { channelBrand } from "@/lib/channels/presentation";
import { CHANNEL_SESSION_REF_COLUMNS, resolveSessionRef } from "@/lib/channels/session-ref";
import { fonteDeTemplates } from "@/lib/channels/templates-fonte";

const MESSENGER = "meta_messenger" as const;
const MIGRATION = "supabase/migrations/20261003020000_0911_canal_messenger_direto.sql";

describe("canal Messenger direto — vocabulário e seam", () => {
  it("janela de 24h sem modelo aprovado, sem custo por mensagem e sem grupo", () => {
    const caps = capabilitiesOf(CHANNEL_PROVIDER_MESSENGER);
    expect(caps.freeformOutsideWindow).toBe(false);
    expect(caps.requiresTemplates).toBe(false);
    expect(caps.canManageTemplates).toBe(false);
    expect(caps.costPerMessage).toBe(false);
    expect(caps.banRisk).toBe(false);
    expect(caps.groups).toBe("none");
    expect(fonteDeTemplates(MESSENGER)).toBeNull();
  });

  it("é canal de MENSAGEM e aparece como Messenger, nunca como número de WhatsApp", () => {
    expect(transportaMensagem(MESSENGER)).toBe(true);
    expect(channelBrand({ provider: MESSENGER })).toBe("messenger");
  });

  it("o sessionRef é o id da página, e a coluna entra no select", () => {
    expect(resolveSessionRef({ provider: MESSENGER, messenger_page_id: "1029384756" })).toBe("1029384756");
    expect(CHANNEL_SESSION_REF_COLUMNS).toContain("messenger_page_id");
  });

  it("o adapter existe, endereça pela thread e os códigos de falha carregam o nome", () => {
    const adapter = getAdapter(MESSENGER);
    expect(adapter.provider).toBe(MESSENGER);
    expect(adapter.resolveRecipient({ isGroup: false, groupChatId: null, phoneNumber: null, waIdentity: null })).toBe("provider-thread");
    expect(adapter.resolveRecipient({ isGroup: true, groupChatId: "g", phoneNumber: null, waIdentity: null })).toBeNull();
    expect(adapter.codes.sendFailed).toContain("messenger");
  });

  it("migration e baseline conhecem o provider, o ramo do CHECK, o arquivo do webhook e o índice único", () => {
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    expect(baseline).toMatch(/channel_sessions_provider_check[\s\S]{0,600}'meta_messenger'::text/);
    expect(baseline).toMatch(/provider = 'meta_messenger' and messenger_page_id is not null/);
    expect(baseline).toMatch(/webhook_events_log_provider_check check \(provider in \([^)]*'meta_messenger'/);
    expect(baseline).toContain("channel_sessions_messenger_page_id_ativo_unique");
    // Colunas ANTES do CHECK que as referencia — senão o install quebra.
    expect(baseline.indexOf("add column if not exists messenger_page_id")).toBeLessThan(
      baseline.indexOf("(provider = 'meta_messenger'"),
    );

    const mig = readFileSync(MIGRATION, "utf8");
    expect(mig).toContain("add column if not exists messenger_page_id");
    expect(mig).toMatch(/provider = 'meta_messenger' and messenger_page_id is not null/);
    expect(mig).toContain("channel_sessions_messenger_page_id_ativo_unique");

    const manifest = readFileSync("supabase/migrations/MANIFEST.md", "utf8");
    expect(manifest).toContain("`0911_canal_messenger_direto`");
  });
});
