/**
 * Adapter do Telegram — traduz o envelope do CRM para a Bot API, e nada mais.
 *
 * Quem endereça é a THREAD (o `chat.id`, em `conversations.provider_conversation_id`),
 * não o contato: o bot só fala com quem já falou com ele — o Telegram não deixa
 * um bot puxar conversa. Ritmo, opt-out e o resto da cadeia antes do envio são
 * de `before_send`, não daqui.
 */
import { MAX_MEDIA_BYTES, MediaTooLargeError } from "@/lib/messaging/media/types";
import { createAdminClient } from "@/lib/supabase/admin";

import { CHANNEL_PROVIDER_TELEGRAM } from "../capabilities";
import type { ChannelAdapter, OutboundKind } from "../types";
import { baixarArquivo, enviar, lerWebhook, sinalizarDigitando, TelegramApiError, type Envio } from "./api";
import { tokenDoBot } from "./bots";
import { externalIdDoTelegram, messageIdDoExternalId, PREFIXO_DE_ARQUIVO } from "./parser";

/** O Telegram não manda o tipo do arquivo, mas o caminho dele traz a extensão — melhor que a dica genérica. */
const MIME_POR_EXTENSAO: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  oga: "audio/ogg",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  pdf: "application/pdf",
};

function mimeDoCaminho(caminho: string): string | null {
  const ext = caminho.split(".").at(-1)?.toLowerCase();
  return ext ? (MIME_POR_EXTENSAO[ext] ?? null) : null;
}

async function token(organizationId: string, botId: string): Promise<string> {
  const t = await tokenDoBot(createAdminClient(), { organizationId, botId });
  if (!t) throw new Error("Reconecte este bot em Conexões › Telegram.");
  return t;
}

const TIPO: Partial<Record<OutboundKind, Exclude<Envio["tipo"], "texto" | "audio" | "voz">>> = {
  image: "foto",
  video: "video",
  document: "documento",
  sticker: "figurinha",
};

/** A frase que quem atende lê quando o Telegram recusa. */
function motivoDaRecusa(err: unknown): Error {
  if (!(err instanceof TelegramApiError)) return err instanceof Error ? err : new Error(String(err));
  if (err.status === 403) return new Error("A pessoa bloqueou o bot no Telegram: não dá para mandar mensagem até ela desbloquear.");
  if (err.status === 401) return new Error("O token do bot deixou de valer. Reconecte o bot em Conexões › Telegram.");
  if (err.status === 429) return new Error("O Telegram pediu para esperar antes de mandar mais mensagens. Tente de novo em instantes.");
  return new Error(`O Telegram recusou o envio: ${err.descricao}`);
}

export const telegramAdapter: ChannelAdapter = {
  provider: CHANNEL_PROVIDER_TELEGRAM,
  resolveRecipient: (input) => (input.isGroup ? null : "provider-thread"),
  // A credencial é do BOT, na linha do canal: se a linha existe, há o que tentar.
  isConfigured: () => true,
  codes: {
    notConfigured: "telegram_not_configured",
    sendFailed: "telegram_send_failed",
    unknownError: "telegram_unknown_error",
  },

  async send(envelope) {
    const chatId = envelope.providerConversationId;
    if (!chatId) throw new Error("Aguarde uma mensagem da pessoa: no Telegram o bot só responde quem falou com ele.");

    let envio: Envio;
    if (envelope.media) {
      const tipo =
        envelope.kind === "audio" ? (envelope.media.asFile ? "audio" : "voz") : TIPO[envelope.kind];
      if (!tipo) throw new Error("Este tipo de mensagem ainda não é suportado no Telegram.");
      envio = { tipo, url: envelope.media.url, legenda: envelope.media.caption ?? null };
    } else if (envelope.kind === "text") {
      envio = { tipo: "texto", texto: envelope.body ?? "" };
    } else {
      throw new Error("Este tipo de mensagem ainda não é suportado no Telegram.");
    }

    const t = await token(envelope.organizationId, envelope.sessionRef);
    await envelope.beforeSend?.();
    try {
      const messageId = await enviar({ token: t, chatId, envio, respondeA: messageIdDoExternalId(envelope.replyToExternalId) });
      return { externalId: externalIdDoTelegram(envelope.sessionRef, chatId, messageId) };
    } catch (err) {
      throw motivoDaRecusa(err);
    }
  },

  async sendTemplate() {
    throw new Error("O Telegram não usa modelos de WhatsApp.");
  },

  async signalTyping(input) {
    // O endereço é a thread; sem ela não há a quem sinalizar (decoração, sai calado).
    if (!input.providerConversationId) return;
    await sinalizarDigitando({ token: await token(input.organizationId, input.sessionRef), chatId: input.providerConversationId });
  },

  async checkHealth(input) {
    const t = await tokenDoBot(createAdminClient(), { organizationId: input.organizationId, botId: input.sessionRef });
    if (!t) return { reachable: true, status: "FAILED", detail: "credencial_indisponivel" };
    try {
      const w = await lerWebhook(t);
      // Webhook apontado para outro lugar = o bot foi ligado em outra plataforma,
      // e as mensagens pararam de chegar aqui.
      if (!w.url.includes("/api/v1/webhooks/channel/")) return { reachable: true, status: "FAILED", detail: "recebimento_desviado" };
      const erroRecente = w.ultimoErroEm && Date.now() - w.ultimoErroEm.getTime() < 15 * 60_000;
      return erroRecente
        ? { reachable: true, status: "FAILED", detail: "entrega_falhando" }
        : { reachable: true, status: "WORKING", detail: null };
    } catch (err) {
      if (err instanceof TelegramApiError && err.status === 401) return { reachable: true, status: "FAILED", detail: "token_revogado" };
      return { reachable: false, status: null, detail: "provedor_indisponivel" };
    }
  },

  /**
   * A mídia que a pessoa mandou. A mensagem guarda só o `file_id`
   * (`tg-file:<id>`): a URL de download traz o token do bot no caminho e não
   * pode ser gravada. Resolve aqui, na hora de baixar.
   */
  async fetchInboundMedia(input) {
    if (!input.url.startsWith(PREFIXO_DE_ARQUIVO)) throw new Error("Endereço de mídia desconhecido para o Telegram.");
    const t = await token(input.organizationId, input.sessionRef);
    const { bytes, caminho } = await baixarArquivo({ token: t, fileId: input.url.slice(PREFIXO_DE_ARQUIVO.length) }).catch((err: unknown) => {
      if (err instanceof TelegramApiError && err.status === 413) throw new MediaTooLargeError();
      throw err;
    });
    if (bytes.byteLength > MAX_MEDIA_BYTES) throw new MediaTooLargeError();
    return { buffer: bytes, mime: mimeDoCaminho(caminho) ?? input.hintMime ?? "application/octet-stream" };
  },
};
