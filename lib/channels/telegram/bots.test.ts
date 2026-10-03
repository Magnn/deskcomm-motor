import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/webhooks/secrets", () => ({
  encryptWebhookSecret: vi.fn(async (_db: unknown, texto: string) => `cifrado(${texto})`),
  decryptWebhookSecret: vi.fn(async (_db: unknown, cifrado: string) => cifrado.replace(/^cifrado\(|\)$/g, "")),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { TelegramApiError } from "./api";
import { botsDaOrganizacao, conectarBot, ConexaoDoTelegramError, tokenDoBot, type DepsDoTelegram } from "./bots";

const TOKEN = "7012345678:AAH1x2y3z4ABCDEFGHIJKLMNOPQRSTUVWXYZab";
const BASE = "https://desk.exemplo";

const banco = (linhas: object[] = []) => {
  // Índice único PARCIAL da 0912: bot + `archived_at` nulo.
  const b = criarBancoEmMemoria({ channel_sessions: linhas }, { channel_sessions: [["telegram_bot_id", "archived_at"]] });
  return { b, db: b.cliente as unknown as SupabaseClient };
};

const deps = (over: Partial<DepsDoTelegram> = {}): DepsDoTelegram => ({
  lerBot: vi.fn(async () => ({ id: "7012345678", username: "loja_bot", nome: "Loja" })),
  ligarWebhook: vi.fn(async () => {}),
  ...over,
});

const entrada = (organizationId = "org-1") => ({ organizationId, userId: "u", token: TOKEN, publicBase: BASE });

describe("conectarBot", () => {
  beforeEach(() => vi.mocked(audit).mockClear());

  it("bot novo: canal WORKING, token cifrado, IA pausada e webhook na rota genérica com segredo", async () => {
    const { b, db } = banco();
    const d = deps();
    const r = await conectarBot(db, d, entrada());
    expect(r).toMatchObject({ resultado: "conectado", username: "loja_bot", recebendo: true });
    const [linha] = b.tabelas.channel_sessions ?? [];
    expect(linha).toMatchObject({
      provider: "telegram_bot",
      telegram_bot_id: "7012345678",
      telegram_bot_token_encrypted: `cifrado(${TOKEN})`,
      display_name: "Telegram · @loja_bot",
      status: "WORKING",
    });
    expect((linha?.metadata as Record<string, unknown>).ai_gate_mode).toBe("pre_go_live");
    const chamada = vi.mocked(d.ligarWebhook).mock.calls[0]?.[0];
    expect(chamada?.url).toBe(`${BASE}/api/v1/webhooks/channel/${String(linha?.webhook_path_token)}`);
    expect(`cifrado(${chamada?.segredo})`).toBe(linha?.webhook_secret_encrypted);
    expect(chamada?.segredo.length).toBeGreaterThanOrEqual(32);
    await expect(tokenDoBot(db, { organizationId: "org-1", botId: "7012345678" })).resolves.toBe(TOKEN);
  });

  it("token fora do formato é recusado sem chamar o Telegram", async () => {
    const { db } = banco();
    const d = deps();
    await expect(conectarBot(db, d, { ...entrada(), token: "abc" })).rejects.toMatchObject({ codigo: "token_invalido" });
    expect(d.lerBot).not.toHaveBeenCalled();
  });

  it("token que o Telegram recusa vira a frase de quem conecta", async () => {
    const { db } = banco();
    const d = deps({ lerBot: vi.fn(async () => Promise.reject(new TelegramApiError("getMe", 401, "Unauthorized"))) });
    await expect(conectarBot(db, d, entrada())).rejects.toBeInstanceOf(ConexaoDoTelegramError);
    await expect(conectarBot(db, d, entrada())).rejects.toMatchObject({ codigo: "token_recusado" });
  });

  it("o mesmo bot ativo em OUTRA empresa é recusado pelo índice, sem ler a outra empresa", async () => {
    const { b, db } = banco([{ id: "x", organization_id: "org-2", provider: "telegram_bot", telegram_bot_id: "7012345678", archived_at: null }]);
    await expect(conectarBot(db, deps(), entrada())).rejects.toMatchObject({ codigo: "bot_de_outra_empresa", status: 409 });
    expect(b.tabelas.channel_sessions).toHaveLength(1);
  });

  it("reconectar o mesmo bot troca o token e MANTÉM a URL e o segredo do webhook", async () => {
    const { b, db } = banco([
      {
        id: "s1",
        organization_id: "org-1",
        provider: "telegram_bot",
        telegram_bot_id: "7012345678",
        telegram_bot_token_encrypted: "cifrado(velho)",
        webhook_path_token: "caminho-antigo",
        webhook_secret_encrypted: "cifrado(segredo-antigo-0123456789)",
        archived_at: null,
        created_at: "2026-10-01T00:00:00Z",
        status: "FAILED",
        metadata: { ai_gate_mode: "open", telegram_falha: "x" },
      },
    ]);
    const d = deps();
    const r = await conectarBot(db, d, entrada());
    expect(r).toMatchObject({ resultado: "reconectado", channelSessionId: "s1" });
    expect(vi.mocked(d.ligarWebhook).mock.calls[0]?.[0]).toMatchObject({ url: `${BASE}/api/v1/webhooks/channel/caminho-antigo`, segredo: "segredo-antigo-0123456789" });
    const [linha] = b.tabelas.channel_sessions ?? [];
    expect(linha?.telegram_bot_token_encrypted).toBe(`cifrado(${TOKEN})`);
    expect(linha?.status).toBe("WORKING");
    // A liberação da IA já feita não volta ao zero; a falha antiga some.
    expect(linha?.metadata).toMatchObject({ ai_gate_mode: "open" });
    expect((linha?.metadata as Record<string, unknown>).telegram_falha).toBeUndefined();
  });

  it("bot excluído antes RESSUSCITA a mesma linha e audita a volta", async () => {
    const { b, db } = banco([
      {
        id: "s-velha",
        organization_id: "org-1",
        provider: "telegram_bot",
        telegram_bot_id: "7012345678",
        webhook_path_token: "c",
        webhook_secret_encrypted: "cifrado(segredo-0123456789abcdef)",
        archived_at: "2026-09-01T00:00:00Z",
        created_at: "2026-08-01T00:00:00Z",
        metadata: {},
      },
    ]);
    const r = await conectarBot(db, deps(), entrada());
    expect(r.channelSessionId).toBe("s-velha");
    expect(b.tabelas.channel_sessions?.[0]?.archived_at).toBeNull();
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "channel.reactivated", resourceId: "s-velha" }));
  });

  it("webhook que não liga deixa o bot FAILED com o motivo do Telegram, visível na tela", async () => {
    const { db } = banco();
    const d = deps({ ligarWebhook: vi.fn(async () => Promise.reject(new TelegramApiError("setWebhook", 400, "bad webhook: HTTPS url must be provided"))) });
    const r = await conectarBot(db, d, entrada());
    expect(r.recebendo).toBe(false);
    const [bot] = await botsDaOrganizacao(db, "org-1");
    expect(bot).toMatchObject({ status: "FAILED", falha: "bad webhook: HTTPS url must be provided" });
    expect(JSON.stringify(bot)).not.toContain(TOKEN);
  });
});
