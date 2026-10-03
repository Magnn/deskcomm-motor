/**
 * Entrada do Telegram: atualização do bot → contato, conversa, mensagem.
 *
 * Chega pela rota genérica por token (`/webhooks/channel/<token>`), que já
 * resolveu a sessão e arquivou o corpo cru. Aqui: conferir o segredo, ler a
 * atualização e gravar pelo MESMO ramo social do Messenger
 * (`../zernio/ingest.ts` → `pos-entrada`): identidade `telegram:<bot>:<pessoa>`,
 * conversa pelo `chat.id`, idempotência por `(organization_id, external_id)`.
 */
import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { ingestZernioInbound } from "../zernio/ingest";
import { confirmarToque } from "./api";
import { tokenDoBot } from "./bots";
import { lerAtualizacao } from "./parser";

/** O cabeçalho em que o Telegram devolve o `secret_token` do `setWebhook`. */
export const CABECALHO_DO_SEGREDO = "x-telegram-bot-api-secret-token";

/** O aviso é do Telegram, para ESTE bot? Tempo constante. */
export function segredoDoTelegramConfere(recebido: string | null, esperado: string | null): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ingerirAtualizacao(
  db: SupabaseClient,
  sessao: { id: string; organization_id: string },
  rawBody: string,
): Promise<Record<string, unknown>> {
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: "ignored", reason: "json_invalido" };
  }

  const { data, error } = await db
    .from("channel_sessions")
    .select("telegram_bot_id")
    .eq("organization_id", sessao.organization_id)
    .eq("id", sessao.id)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`telegram: leitura da sessão falhou: ${error.message}`);
  const botId = (data as { telegram_bot_id: string | null } | null)?.telegram_bot_id;
  if (!botId) return { status: "ignored", reason: "canal_desconhecido" };

  const lida = lerAtualizacao(payload, botId);
  if (!lida) return { status: "ignored", reason: "atualizacao_sem_interesse" };

  // O "carregando" do botão some na tela da pessoa. Decoração: falhar aqui não
  // pode impedir a mensagem de entrar.
  if (lida.callbackQueryId) {
    const token = await tokenDoBot(db, { organizationId: sessao.organization_id, botId });
    if (token) {
      await confirmarToque({ token, callbackQueryId: lida.callbackQueryId }).catch((err: unknown) => {
        logger.warn("[telegram] toque no botão não confirmado", { erro: err instanceof Error ? err.message.slice(0, 200) : String(err) });
      });
    }
  }

  const r = await ingestZernioInbound(db, {
    organizationId: sessao.organization_id,
    channelSessionId: sessao.id,
    payload: null,
    socialMessage: lida.mensagem,
  });
  return { ...r };
}
