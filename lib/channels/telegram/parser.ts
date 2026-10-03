/**
 * A ATUALIZAÇÃO DO TELEGRAM, lida — puro, sem banco.
 *
 * Um aviso é UMA atualização (`update`). Interessam duas: `message` (a pessoa
 * escreveu, mandou mídia ou localização) e `callback_query` (tocou num botão).
 * Só conversa PRIVADA vira atendimento: grupo e canal ficam de fora até o CRM
 * saber atender grupo no Telegram — responder num grupo inteiro como se fosse
 * uma pessoa seria o pior defeito possível.
 *
 * ─── O endereço ─────────────────────────────────────────────────────────────
 * Em conversa privada o `chat.id` é o id da pessoa, e é ele que endereça o
 * envio — é a "thread" deste canal. O id da mensagem (`message_id`) só é único
 * DENTRO da conversa, então o id gravado leva bot + conversa + mensagem.
 *
 * ─── Eco ────────────────────────────────────────────────────────────────────
 * O Telegram NÃO devolve ao webhook o que o próprio bot mandou. Não há eco a
 * filtrar — e também não há como ver resposta dada por fora (um bot não tem
 * "celular do atendente"): toda saída deste canal nasce no CRM.
 */
import type { Localizacao } from "@/lib/messaging/localizacao";

import { socialMessageId } from "../social/catalog";
import type { SocialMessage } from "../social/parser";

/** Prefixo do ponteiro de arquivo gravado em `media_url` — a URL real carrega o token do bot. */
export const PREFIXO_DE_ARQUIVO = "tg-file:";

export interface AtualizacaoLida {
  mensagem: SocialMessage;
  /** Toque em botão: precisa de resposta ao Telegram, senão o botão fica "carregando". */
  callbackQueryId: string | null;
}

type Bruto = Record<string, unknown>;
const obj = (v: unknown): Bruto | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const idTexto = (v: unknown): string | null => (typeof v === "number" || (typeof v === "string" && v !== "") ? String(v) : null);

export function externalIdDoTelegram(botId: string, chatId: string, messageId: string | number): string {
  return socialMessageId(botId, `${chatId}:${messageId}`);
}

/** O `message_id` de volta, a partir do id gravado — para citar a mensagem ao responder. */
export function messageIdDoExternalId(externalId: string | null | undefined): number | null {
  const ultimo = externalId?.split(":").at(-1);
  const n = ultimo ? Number(ultimo) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

function anexoDe(m: Bruto): { type: string; url: string } | null {
  const arquivo = (tipo: string, v: unknown) => {
    const id = str(obj(v)?.file_id);
    return id ? { type: tipo, url: `${PREFIXO_DE_ARQUIVO}${id}` } : null;
  };
  // Foto chega em vários tamanhos; o último é o maior.
  const fotos = Array.isArray(m.photo) ? m.photo : [];
  if (fotos.length > 0) return arquivo("image", fotos[fotos.length - 1]);
  if (m.video) return arquivo("video", m.video);
  if (m.video_note) return arquivo("video", m.video_note);
  if (m.voice) return arquivo("audio", m.voice);
  if (m.audio) return arquivo("audio", m.audio);
  if (m.sticker) return arquivo("sticker", m.sticker);
  if (m.animation) return arquivo("video", m.animation);
  if (m.document) return arquivo("document", m.document);
  return null;
}

function localizacaoDe(m: Bruto): Localizacao | null {
  const venue = obj(m.venue);
  const loc = obj(venue?.location ?? m.location);
  if (!loc || typeof loc.latitude !== "number" || typeof loc.longitude !== "number") return null;
  return { latitude: loc.latitude, longitude: loc.longitude, nome: str(venue?.title), endereco: str(venue?.address) };
}

function identidade(from: Bruto) {
  const nome = [str(from.first_name), str(from.last_name)].filter(Boolean).join(" ").trim();
  return {
    phone: null,
    bsuid: null,
    anchor: null,
    username: str(from.username),
    displayName: nome !== "" ? nome : str(from.username),
  };
}

/** O rótulo do botão tocado: é o que a pessoa VIU, não o `callback_data` (que é código). */
function rotuloDoBotao(mensagem: Bruto | null, dado: string | null): string | null {
  const teclado = obj(mensagem?.reply_markup)?.inline_keyboard;
  if (!Array.isArray(teclado)) return null;
  for (const linha of teclado) {
    if (!Array.isArray(linha)) continue;
    for (const b of linha) {
      const botao = obj(b);
      if (botao && str(botao.callback_data) === dado) return str(botao.text);
    }
  }
  return null;
}

export function lerAtualizacao(payload: unknown, botId: string): AtualizacaoLida | null {
  const u = obj(payload);
  if (!u) return null;

  const toque = obj(u.callback_query);
  if (toque) {
    const from = obj(toque.from);
    const mensagem = obj(toque.message);
    const chat = obj(mensagem?.chat);
    const chatId = idTexto(chat?.id);
    const id = str(toque.id);
    if (!from || from.is_bot === true || !chatId || !id || str(chat?.type) !== "private") return null;
    const rotulo = rotuloDoBotao(mensagem, str(toque.data)) ?? str(toque.data);
    if (!rotulo) return null;
    return {
      callbackQueryId: id,
      mensagem: montar({ botId, chatId, participante: idTexto(from.id) ?? chatId, idDaMensagem: `cb${id}`, texto: rotulo, anexos: [], data: null, from, local: null }),
    };
  }

  const m = obj(u.message);
  if (!m) return null;
  const chat = obj(m.chat);
  const from = obj(m.from);
  const chatId = idTexto(chat?.id);
  const messageId = idTexto(m.message_id);
  if (!chat || !from || !chatId || !messageId || str(chat.type) !== "private" || from.is_bot === true) return null;

  const anexo = anexoDe(m);
  const local = anexo ? null : localizacaoDe(m);
  const texto = str(m.text) ?? str(m.caption);
  if (!texto && !anexo && !local) return null;

  return {
    callbackQueryId: null,
    mensagem: montar({
      botId,
      chatId,
      participante: idTexto(from.id) ?? chatId,
      idDaMensagem: messageId,
      texto,
      anexos: anexo ? [anexo] : [],
      data: typeof m.date === "number" ? new Date(m.date * 1000).toISOString() : null,
      from,
      local,
    }),
  };
}

function montar(p: {
  botId: string;
  chatId: string;
  participante: string;
  idDaMensagem: string;
  texto: string | null;
  anexos: { type: string; url: string }[];
  data: string | null;
  from: Bruto;
  local: Localizacao | null;
}): SocialMessage {
  return {
    platform: "telegram",
    participantId: p.participante,
    accountId: p.botId,
    conversationId: p.chatId,
    externalId: externalIdDoTelegram(p.botId, p.chatId, p.idDaMensagem),
    direction: "inbound",
    kind: "message",
    text: p.texto,
    sentAt: p.data,
    attachments: p.anexos,
    referral: null,
    location: p.local,
    identity: identidade(p.from),
  };
}
