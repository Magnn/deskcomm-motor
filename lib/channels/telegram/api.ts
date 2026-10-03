/**
 * A CONVERSA COM A BOT API DO TELEGRAM — só as chamadas, sem banco.
 *
 * Toda chamada é `POST https://api.telegram.org/bot<TOKEN>/<método>` com JSON, e
 * a resposta é sempre `{ ok, result }` ou `{ ok: false, error_code, description }`.
 * O token vai NO CAMINHO (é o desenho da Bot API), então nenhuma URL montada
 * aqui pode ir para log, banco ou erro: `TelegramApiError` carrega o método e a
 * descrição do Telegram, nunca a URL.
 *
 * O arquivo que a pessoa manda também mora atrás do token
 * (`/file/bot<TOKEN>/<caminho>`). Por isso a mensagem gravada guarda só o
 * `file_id` (`tg-file:<id>`) e quem baixa resolve na hora — ver o adapter.
 */
const BASE = "https://api.telegram.org";
const TETO_MS = 15_000;

/** O Telegram não entrega arquivo acima disto pela Bot API. */
export const TETO_DE_ARQUIVO_BYTES = 20 * 1024 * 1024;

/** Os tipos de atualização que o webhook recebe. Pedir menos é menos tráfego e menos superfície. */
export const ATUALIZACOES = ["message", "callback_query"] as const;

export class TelegramApiError extends Error {
  constructor(
    public readonly metodo: string,
    public readonly status: number,
    public readonly descricao: string,
  ) {
    super(`telegram_${metodo}_${status}: ${descricao}`);
  }
}

type Buscar = typeof fetch;

/** Formato do token do BotFather: `<id do bot>:<segredo>`. */
const FORMATO_DO_TOKEN = /^(\d{5,15}):[A-Za-z0-9_-]{30,64}$/;

export function idDoBotNoToken(token: string): string | null {
  return FORMATO_DO_TOKEN.exec(token.trim())?.[1] ?? null;
}

async function chamar<T>(buscar: Buscar, token: string, metodo: string, corpo?: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await buscar(`${BASE}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo ?? {}),
      redirect: "error",
      signal: AbortSignal.timeout(TETO_MS),
    });
  } catch (err) {
    // A mensagem do `fetch` pode trazer a URL — e a URL traz o token.
    throw new TelegramApiError(metodo, 0, err instanceof Error && err.name === "TimeoutError" ? "tempo esgotado" : "rede indisponível");
  }
  type Resposta = { ok?: boolean; result?: T; description?: string; error_code?: number };
  let json: Resposta | null = null;
  try {
    json = (await res.json()) as Resposta;
  } catch {
    json = null;
  }
  if (!json?.ok) throw new TelegramApiError(metodo, json?.error_code ?? res.status, json?.description ?? `HTTP ${res.status}`);
  return json.result as T;
}

export interface BotDoTelegram {
  id: string;
  username: string;
  nome: string;
}

/** Quem é o bot deste token. É a validação do token: token errado volta 401. */
export async function lerBot(token: string, buscar: Buscar = fetch): Promise<BotDoTelegram> {
  const r = await chamar<{ id: number; username?: string; first_name?: string; is_bot?: boolean }>(buscar, token, "getMe");
  if (!r.is_bot) throw new TelegramApiError("getMe", 400, "o token não é de um bot");
  return { id: String(r.id), username: r.username ?? String(r.id), nome: r.first_name ?? r.username ?? String(r.id) };
}

/**
 * Aponta o bot para a NOSSA URL, com o segredo que o Telegram devolve em todo
 * aviso no cabeçalho `X-Telegram-Bot-Api-Secret-Token`. Substitui o webhook que
 * o bot tinha — inclusive o de outra plataforma (o bot só tem um).
 */
export async function ligarWebhook(
  p: { token: string; url: string; segredo: string },
  buscar: Buscar = fetch,
): Promise<void> {
  await chamar<boolean>(buscar, p.token, "setWebhook", {
    url: p.url,
    secret_token: p.segredo,
    allowed_updates: ATUALIZACOES,
    // Mensagens que chegaram com o bot desligado ficam de fora: responder horas
    // depois, de uma vez, a quem já desistiu é pior que não responder.
    drop_pending_updates: true,
  });
}

export async function desligarWebhook(token: string, buscar: Buscar = fetch): Promise<void> {
  await chamar<boolean>(buscar, token, "deleteWebhook", { drop_pending_updates: false });
}

export interface EstadoDoWebhook {
  url: string;
  ultimoErro: string | null;
  ultimoErroEm: Date | null;
}

export async function lerWebhook(token: string, buscar: Buscar = fetch): Promise<EstadoDoWebhook> {
  const r = await chamar<{ url?: string; last_error_message?: string; last_error_date?: number }>(buscar, token, "getWebhookInfo");
  return {
    url: r.url ?? "",
    ultimoErro: r.last_error_message ?? null,
    ultimoErroEm: r.last_error_date ? new Date(r.last_error_date * 1000) : null,
  };
}

/** Como cada tipo de envio do CRM vira um método da Bot API. */
export type Envio =
  | { tipo: "texto"; texto: string }
  | { tipo: "foto" | "video" | "audio" | "voz" | "documento" | "figurinha"; url: string; legenda?: string | null };

const METODO: Record<Exclude<Envio["tipo"], "texto">, { metodo: string; campo: string }> = {
  foto: { metodo: "sendPhoto", campo: "photo" },
  video: { metodo: "sendVideo", campo: "video" },
  audio: { metodo: "sendAudio", campo: "audio" },
  voz: { metodo: "sendVoice", campo: "voice" },
  documento: { metodo: "sendDocument", campo: "document" },
  figurinha: { metodo: "sendSticker", campo: "sticker" },
};

/** Envia e devolve o `message_id` — único dentro da conversa. */
export async function enviar(
  p: { token: string; chatId: string; envio: Envio; respondeA?: number | null },
  buscar: Buscar = fetch,
): Promise<number> {
  const resposta = p.respondeA ? { reply_parameters: { message_id: p.respondeA, allow_sending_without_reply: true } } : {};
  if (p.envio.tipo === "texto") {
    const r = await chamar<{ message_id: number }>(buscar, p.token, "sendMessage", { chat_id: p.chatId, text: p.envio.texto, ...resposta });
    return r.message_id;
  }
  const { metodo, campo } = METODO[p.envio.tipo];
  // Figurinha não tem legenda no Telegram; os demais aceitam.
  const legenda = p.envio.tipo !== "figurinha" && p.envio.legenda ? { caption: p.envio.legenda } : {};
  const r = await chamar<{ message_id: number }>(buscar, p.token, metodo, { chat_id: p.chatId, [campo]: p.envio.url, ...legenda, ...resposta });
  return r.message_id;
}

export async function sinalizarDigitando(p: { token: string; chatId: string }, buscar: Buscar = fetch): Promise<void> {
  await chamar<boolean>(buscar, p.token, "sendChatAction", { chat_id: p.chatId, action: "typing" });
}

/** Para o "carregando" do botão sumir na tela da pessoa depois do toque. */
export async function confirmarToque(p: { token: string; callbackQueryId: string }, buscar: Buscar = fetch): Promise<void> {
  await chamar<boolean>(buscar, p.token, "answerCallbackQuery", { callback_query_id: p.callbackQueryId });
}

/** Baixa o arquivo que a pessoa mandou, pelo `file_id`. */
export async function baixarArquivo(
  p: { token: string; fileId: string },
  buscar: Buscar = fetch,
): Promise<{ bytes: Buffer; caminho: string }> {
  const info = await chamar<{ file_path?: string; file_size?: number }>(buscar, p.token, "getFile", { file_id: p.fileId });
  if (!info.file_path) throw new TelegramApiError("getFile", 404, "arquivo indisponível");
  if ((info.file_size ?? 0) > TETO_DE_ARQUIVO_BYTES) throw new TelegramApiError("getFile", 413, "arquivo grande demais");
  let res: Response;
  try {
    res = await buscar(`${BASE}/file/bot${p.token}/${info.file_path}`, { redirect: "error", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new TelegramApiError("download", 0, "rede indisponível");
  }
  if (!res.ok) throw new TelegramApiError("download", res.status, `HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > TETO_DE_ARQUIVO_BYTES) throw new TelegramApiError("download", 413, "arquivo grande demais");
  return { bytes, caminho: info.file_path };
}
