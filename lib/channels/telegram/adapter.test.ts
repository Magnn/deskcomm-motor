import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./bots", () => ({ tokenDoBot: vi.fn() }));

import { telegramAdapter } from "./adapter";
import { tokenDoBot } from "./bots";
import { externalIdDoTelegram } from "./parser";

const TOKEN = "7012345678:AAH1x2y3z4ABCDEFGHIJKLMNOPQRSTUVWXYZab";
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });
const erro = (status: number, description: string) => new Response(JSON.stringify({ ok: false, error_code: status, description }), { status });
const env = { organizationId: "org-1", sessionRef: "7012345678", to: "provider-thread", providerConversationId: "55501" };

describe("telegramAdapter.send", () => {
  const buscar = vi.fn();
  beforeEach(() => {
    vi.mocked(tokenDoBot).mockResolvedValue(TOKEN);
    buscar.mockReset();
    vi.stubGlobal("fetch", buscar);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("texto vai para o chat da thread e volta com o id que a mensagem gravada usa", async () => {
    buscar.mockImplementation(async () => ok({ message_id: 900 }));
    const r = await telegramAdapter.send({ ...env, kind: "text", body: "olá", replyToExternalId: externalIdDoTelegram("7012345678", "55501", 10) });
    expect(r.externalId).toBe(externalIdDoTelegram("7012345678", "55501", 900));
    const corpo = JSON.parse(String((buscar.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo).toMatchObject({ chat_id: "55501", text: "olá", reply_parameters: { message_id: 10 } });
  });

  it("áudio é nota de voz; com asFile vai como arquivo de áudio", async () => {
    buscar.mockImplementation(async () => ok({ message_id: 1 }));
    await telegramAdapter.send({ ...env, kind: "audio", media: { url: "https://x/a.ogg", mime: "audio/ogg" } });
    await telegramAdapter.send({ ...env, kind: "audio", media: { url: "https://x/a.mp3", mime: "audio/mpeg", asFile: true } });
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(/\/sendVoice$/);
    expect(String(buscar.mock.calls[1]?.[0])).toMatch(/\/sendAudio$/);
  });

  it("sem thread não há a quem responder (o bot não puxa conversa)", async () => {
    await expect(telegramAdapter.send({ ...env, providerConversationId: null, kind: "text", body: "x" })).rejects.toThrow(/só responde quem falou/);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("pessoa que bloqueou o bot vira a frase certa", async () => {
    buscar.mockImplementation(async () => erro(403, "Forbidden: bot was blocked by the user"));
    await expect(telegramAdapter.send({ ...env, kind: "text", body: "x" })).rejects.toThrow(/bloqueou o bot/);
  });

  it("confere a origem ANTES de transportar", async () => {
    const beforeSend = vi.fn().mockRejectedValue(new Error("superado"));
    await expect(telegramAdapter.send({ ...env, kind: "text", body: "x", beforeSend })).rejects.toThrow("superado");
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("telegramAdapter.fetchInboundMedia", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolve o file_id na hora e acerta o tipo pela extensão do caminho", async () => {
    vi.mocked(tokenDoBot).mockResolvedValue(TOKEN);
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(ok({ file_path: "voice/file_3.oga", file_size: 2 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([9, 9]), { status: 200 }));
    vi.stubGlobal("fetch", buscar);
    const r = await telegramAdapter.fetchInboundMedia!({ organizationId: "org-1", sessionRef: "7012345678", url: "tg-file:abc", hintMime: "audio/ogg" });
    expect(r.mime).toBe("audio/ogg");
    expect(r.buffer.byteLength).toBe(2);
    expect(JSON.parse(String((buscar.mock.calls[0] as [string, RequestInit])[1].body))).toEqual({ file_id: "abc" });
  });

  it("endereço que não é ponteiro do Telegram é recusado (nunca baixa URL arbitrária)", async () => {
    await expect(telegramAdapter.fetchInboundMedia!({ organizationId: "org-1", sessionRef: "1", url: "https://interno/segredo" })).rejects.toThrow(/desconhecido/);
  });
});

describe("telegramAdapter.checkHealth", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("webhook apontado para outro lugar = recebimento desviado", async () => {
    vi.mocked(tokenDoBot).mockResolvedValue(TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ok({ url: "https://outra-plataforma/hook" })));
    await expect(telegramAdapter.checkHealth!({ organizationId: "org-1", sessionRef: "1" })).resolves.toMatchObject({ status: "FAILED", detail: "recebimento_desviado" });
  });

  it("webhook nosso e sem erro recente = WORKING", async () => {
    vi.mocked(tokenDoBot).mockResolvedValue(TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => ok({ url: "https://desk/api/v1/webhooks/channel/abc" })));
    await expect(telegramAdapter.checkHealth!({ organizationId: "org-1", sessionRef: "1" })).resolves.toMatchObject({ status: "WORKING" });
  });
});
