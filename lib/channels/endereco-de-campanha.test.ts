import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { enderecoDoCanal } from "./endereco-de-campanha";

describe("enderecoDoCanal", () => {
  const banco = () =>
    criarBancoEmMemoria({
      channel_sessions: [
        { id: "qr", organization_id: "org-1", provider: "waha", waha_session_name: "s1", metadata: {} },
        { id: "tg", organization_id: "org-1", provider: "telegram_bot", telegram_bot_id: "7012345678", metadata: { social_platform: "telegram" } },
        { id: "fb", organization_id: "org-1", provider: "meta_messenger", messenger_page_id: "pg1", metadata: { social_platform: "facebook" } },
        { id: "voz", organization_id: "org-1", provider: "wacalls", wacalls_session_id: "v", metadata: {} },
      ],
    }).cliente as unknown as SupabaseClient;

  it("número de WhatsApp acha pelo telefone", async () => {
    await expect(enderecoDoCanal(banco(), "org-1", "qr")).resolves.toEqual({ tipo: "telefone" });
  });

  it("bot do Telegram acha pela conversa, sem janela; página do Messenger acha pela conversa, COM janela", async () => {
    await expect(enderecoDoCanal(banco(), "org-1", "tg")).resolves.toEqual({ tipo: "conversa", prefixo: "telegram:7012345678:", semJanela: true });
    await expect(enderecoDoCanal(banco(), "org-1", "fb")).resolves.toEqual({ tipo: "conversa", prefixo: "facebook:pg1:", semJanela: false });
  });

  it("canal de outra empresa, inexistente ou que não transporta mensagem não tem endereço", async () => {
    await expect(enderecoDoCanal(banco(), "org-2", "tg")).resolves.toBeNull();
    await expect(enderecoDoCanal(banco(), "org-1", "nao-existe")).resolves.toBeNull();
    await expect(enderecoDoCanal(banco(), "org-1", "voz")).resolves.toBeNull();
  });
});
