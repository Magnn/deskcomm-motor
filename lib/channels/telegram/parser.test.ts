import { describe, expect, it } from "vitest";

import { externalIdDoTelegram, lerAtualizacao, messageIdDoExternalId, PREFIXO_DE_ARQUIVO } from "./parser";

const BOT = "7012345678";
const PESSOA = { id: 55501, is_bot: false, first_name: "Ana", last_name: "Lima", username: "analima" };
const privado = { id: 55501, type: "private" };

const msg = (extra: Record<string, unknown>) => ({ update_id: 1, message: { message_id: 10, date: 1_700_000_000, chat: privado, from: PESSOA, ...extra } });

describe("lerAtualizacao", () => {
  it("texto da pessoa vira entrada, endereçada pelo chat.id, com nome e @", () => {
    const r = lerAtualizacao(msg({ text: "oi" }), BOT);
    expect(r?.callbackQueryId).toBeNull();
    expect(r?.mensagem).toMatchObject({
      platform: "telegram",
      direction: "inbound",
      text: "oi",
      conversationId: "55501",
      participantId: "55501",
      accountId: BOT,
      externalId: externalIdDoTelegram(BOT, "55501", 10),
      sentAt: new Date(1_700_000_000_000).toISOString(),
      identity: { displayName: "Ana Lima", username: "analima", phone: null },
    });
  });

  it("foto: pega o MAIOR tamanho e grava só o file_id (a URL real carrega o token)", () => {
    const r = lerAtualizacao(msg({ photo: [{ file_id: "pequena" }, { file_id: "grande" }], caption: "olha" }), BOT);
    expect(r?.mensagem.attachments).toEqual([{ type: "image", url: `${PREFIXO_DE_ARQUIVO}grande` }]);
    expect(r?.mensagem.text).toBe("olha");
  });

  it("nota de voz, documento e figurinha viram os tipos do CRM", () => {
    expect(lerAtualizacao(msg({ voice: { file_id: "v" } }), BOT)?.mensagem.attachments[0]?.type).toBe("audio");
    expect(lerAtualizacao(msg({ document: { file_id: "d" } }), BOT)?.mensagem.attachments[0]?.type).toBe("document");
    expect(lerAtualizacao(msg({ sticker: { file_id: "s" } }), BOT)?.mensagem.attachments[0]?.type).toBe("sticker");
  });

  it("localização vira o pino da conversa", () => {
    const r = lerAtualizacao(msg({ venue: { location: { latitude: -23.5, longitude: -46.6 }, title: "Loja", address: "Rua A, 1" } }), BOT);
    expect(r?.mensagem.location).toEqual({ latitude: -23.5, longitude: -46.6, nome: "Loja", endereco: "Rua A, 1" });
  });

  it("toque em botão vira o RÓTULO do botão e pede confirmação ao Telegram", () => {
    const r = lerAtualizacao(
      {
        update_id: 2,
        callback_query: {
          id: "cbq-9",
          from: PESSOA,
          data: "PLANO_PRO",
          message: { message_id: 11, chat: privado, reply_markup: { inline_keyboard: [[{ text: "Quero o Pro", callback_data: "PLANO_PRO" }]] } },
        },
      },
      BOT,
    );
    expect(r?.callbackQueryId).toBe("cbq-9");
    expect(r?.mensagem.text).toBe("Quero o Pro");
    expect(r?.mensagem.conversationId).toBe("55501");
  });

  it("grupo, canal, outro bot e mensagem vazia não viram atendimento", () => {
    expect(lerAtualizacao(msg({ chat: { id: -100, type: "group" }, text: "oi" }), BOT)).toBeNull();
    expect(lerAtualizacao(msg({ chat: { id: -101, type: "supergroup" }, text: "oi" }), BOT)).toBeNull();
    expect(lerAtualizacao(msg({ from: { ...PESSOA, is_bot: true }, text: "oi" }), BOT)).toBeNull();
    expect(lerAtualizacao(msg({}), BOT)).toBeNull();
    expect(lerAtualizacao({ update_id: 3, edited_message: { text: "x" } }, BOT)).toBeNull();
  });
});

describe("messageIdDoExternalId", () => {
  it("devolve o message_id para citar; toque em botão não é citável", () => {
    expect(messageIdDoExternalId(externalIdDoTelegram(BOT, "55501", 42))).toBe(42);
    expect(messageIdDoExternalId(externalIdDoTelegram(BOT, "55501", "cbabc"))).toBeNull();
    expect(messageIdDoExternalId(null)).toBeNull();
  });
});
