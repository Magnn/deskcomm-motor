/**
 * /api/v1/telegram — a aba Conexões › Telegram.
 *
 *   GET  (viewer) → os bots conectados. Nenhum token sai daqui.
 *   POST (admin)  → conecta um bot pelo token do BotFather.
 *
 * Bot não é número de WhatsApp: a trava do plano não se aplica (declarado na
 * cerca `planos-trava-toda-porta-de-numero`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { mfaEmDivida } from "@/lib/auth/server";
import { botsDaOrganizacao, conectarBot, ConexaoDoTelegramError, depsReaisDoTelegram } from "@/lib/channels/telegram/bots";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.object({ token: z.string().min(20).max(200) }).strict();

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  try {
    return ok({ bots: await botsDaOrganizacao(createAdminClient(), auth.org.orgId) }, { requestId });
  } catch (err) {
    logger.error("[telegram] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar o Telegram."), 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  if (await mfaEmDivida()) return fail("mfa_required", t("Confirme a verificação em duas etapas."), 403, { requestId });

  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("invalid_request", t("Cole o token do bot."), 400, { requestId });

  // O Telegram só entrega em HTTPS público: sem isso o webhook nunca liga.
  let publicBase: string;
  try {
    const url = new URL(env.NEXT_PUBLIC_APP_URL);
    if (url.protocol !== "https:" || url.hostname === "placeholder.invalid") throw new Error("sem https");
    publicBase = url.origin;
  } catch {
    return fail("endereco_publico", t("Configure o endereço público da instalação (https) antes de conectar o Telegram."), 422, { requestId });
  }

  try {
    const r = await conectarBot(createAdminClient(), depsReaisDoTelegram, {
      organizationId: auth.org.orgId,
      userId: auth.user.id,
      token: lido.data.token,
      publicBase,
    });
    void audit({
      action: "telegram.bot_conectado",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "channel_session",
      resourceId: r.channelSessionId,
      requestId,
      metadata: { bot: r.username, resultado: r.resultado, recebendo: r.recebendo },
    });
    return ok(r, { requestId });
  } catch (err) {
    if (err instanceof ConexaoDoTelegramError) return fail(err.codigo, t(err.message), err.status, { requestId });
    logger.error("[telegram] conexão falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("telegram_indisponivel", t("Não foi possível falar com o Telegram. Tente de novo em instantes."), 502, { requestId });
  }
}
