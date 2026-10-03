import { describe, expect, it, vi } from "vitest";

import { baixarArquivo, enviar, idDoBotNoToken, lerBot, ligarWebhook, TelegramApiError } from "./api";

const TOKEN = "7012345678:AAH1x2y3z4ABCDEFGHIJKLMNOPQRSTUVWXYZab";
const ok = (result: unknown) => new Response(JSON.stringify({ ok: true, result }), { status: 200 });
const erro = (status: number, description: string) => new Response(JSON.stringify({ ok: false, error_code: status, description }), { status });
const corpoDe = (buscar: ReturnType<typeof vi.fn>, i = 0) => JSON.parse(String((buscar.mock.calls[i] as [string, RequestInit])[1].body));

describe("idDoBotNoToken", () => {
  it("lê o id do bot do formato do BotFather e recusa o que não é token", () => {
    expect(idDoBotNoToken(TOKEN)).toBe("7012345678");
    expect(idDoBotNoToken("  " + TOKEN + "  ")).toBe("7012345678");
    expect(idDoBotNoToken("não é token")).toBeNull();
    expect(idDoBotNoToken("123:curto")).toBeNull();
  });
});

describe("lerBot", () => {
  it("devolve id, @ e nome; token recusado vira erro com o status do Telegram", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(ok({ id: 7012345678, is_bot: true, username: "loja_bot", first_name: "Loja" }));
    await expect(lerBot(TOKEN, buscar as unknown as typeof fetch)).resolves.toEqual({ id: "7012345678", username: "loja_bot", nome: "Loja" });
    buscar.mockResolvedValueOnce(erro(401, "Unauthorized"));
    await expect(lerBot(TOKEN, buscar as unknown as typeof fetch)).rejects.toMatchObject({ status: 401, metodo: "getMe" });
  });

  it("erro de rede NUNCA carrega a URL (que tem o token)", async () => {
    const buscar = vi.fn().mockRejectedValue(new TypeError(`fetch failed for https://api.telegram.org/bot${TOKEN}/getMe`));
    const e = await lerBot(TOKEN, buscar as unknown as typeof fetch).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TelegramApiError);
    expect(String((e as Error).message)).not.toContain(TOKEN);
  });
});

describe("ligarWebhook", () => {
  it("manda URL, segredo, só os tipos que interessam e descarta o acúmulo", async () => {
    const buscar = vi.fn().mockResolvedValue(ok(true));
    await ligarWebhook({ token: TOKEN, url: "https://desk/api/v1/webhooks/channel/abc", segredo: "s".repeat(64) }, buscar as unknown as typeof fetch);
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(/\/setWebhook$/);
    expect(corpoDe(buscar)).toEqual({
      url: "https://desk/api/v1/webhooks/channel/abc",
      secret_token: "s".repeat(64),
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    });
  });
});

describe("enviar", () => {
  it("texto por sendMessage, citando a mensagem quando pedido", async () => {
    const buscar = vi.fn().mockResolvedValue(ok({ message_id: 77 }));
    await expect(enviar({ token: TOKEN, chatId: "55501", envio: { tipo: "texto", texto: "olá" }, respondeA: 10 }, buscar as unknown as typeof fetch)).resolves.toBe(77);
    expect(corpoDe(buscar)).toEqual({ chat_id: "55501", text: "olá", reply_parameters: { message_id: 10, allow_sending_without_reply: true } });
  });

  it("mídia pelo método certo, com legenda; figurinha sem legenda", async () => {
    const buscar = vi.fn().mockImplementation(async () => ok({ message_id: 1 }));
    await enviar({ token: TOKEN, chatId: "1", envio: { tipo: "voz", url: "https://x/a.ogg", legenda: "ouça" } }, buscar as unknown as typeof fetch);
    expect(String(buscar.mock.calls[0]?.[0])).toMatch(/\/sendVoice$/);
    expect(corpoDe(buscar, 0)).toEqual({ chat_id: "1", voice: "https://x/a.ogg", caption: "ouça" });
    await enviar({ token: TOKEN, chatId: "1", envio: { tipo: "figurinha", url: "https://x/s.webp", legenda: "ignorada" } }, buscar as unknown as typeof fetch);
    expect(String(buscar.mock.calls[1]?.[0])).toMatch(/\/sendSticker$/);
    expect(corpoDe(buscar, 1)).toEqual({ chat_id: "1", sticker: "https://x/s.webp" });
  });
});

describe("baixarArquivo", () => {
  it("resolve o caminho pelo getFile e baixa os bytes", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(ok({ file_path: "photos/file_1.jpg", file_size: 3 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const r = await baixarArquivo({ token: TOKEN, fileId: "abc" }, buscar as unknown as typeof fetch);
    expect(r.caminho).toBe("photos/file_1.jpg");
    expect([...r.bytes]).toEqual([1, 2, 3]);
  });

  it("arquivo acima do teto da Bot API é recusado antes de baixar", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(ok({ file_path: "v.mp4", file_size: 50 * 1024 * 1024 }));
    await expect(baixarArquivo({ token: TOKEN, fileId: "abc" }, buscar as unknown as typeof fetch)).rejects.toMatchObject({ status: 413 });
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});
