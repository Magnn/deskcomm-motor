/**
 * /api/v1/webhooks/messenger — os avisos das páginas do Facebook.
 *
 *   GET  → o handshake: a Meta chama com `hub.verify_token` ao cadastrar o
 *          webhook (inclusive DURANTE a ligação automática feita na conexão), e
 *          só o token certo recebe o `hub.challenge` de volta, em texto puro.
 *   POST → os avisos. A origem é conferida pela assinatura do corpo CRU
 *          (`X-Hub-Signature-256`, segredo do app) ANTES de qualquer leitura.
 *
 * Por que UMA URL, sem token no caminho como a do WhatsApp oficial: a Meta não
 * deixa apontar o webhook de uma página para outra URL — é um por app, para
 * todas as páginas. A organização vem da PÁGINA (`entry.id`), achada no banco
 * pela sessão ativa com aquele id (índice único entre ativos, migration 0911) —
 * nunca de um campo do corpo que diga "sou da organização X".
 *
 * 200 para o que não interessa (evento de outro tipo, página que não é canal
 * aqui): a Meta reentrega o que não recebeu 200, e recusar um aviso que nunca
 * vai servir faria a reentrega durar para sempre. 500 só em falha de ESCRITA —
 * aí reentregar é o que queremos, e a idempotência por `mid` absorve o repetido.
 */
import type { NextRequest } from "next/server";

import { appDoMessenger } from "@/lib/channels/messenger/app";
import { ingerirAviso } from "@/lib/channels/messenger/ingest";
import { eventosDoAviso } from "@/lib/channels/messenger/parser";
import { verificationChallenge, verifyMetaSignature } from "@/lib/channels/meta/webhook";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Um aviso tem poucos KB; acima disto não é a Meta. */
const TAMANHO_MAXIMO_DO_CORPO = 1024 * 1024;

const texto = (corpo: string, status: number) =>
  new Response(corpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: NextRequest): Promise<Response> {
  const app = await appDoMessenger();
  if (!app) return texto("not found", 404);
  const challenge = verificationChallenge(new URL(req.url).searchParams, app.verifyToken);
  if (challenge === null) return texto("forbidden", 403);
  return texto(challenge, 200);
}

export async function POST(req: NextRequest): Promise<Response> {
  const app = await appDoMessenger();
  if (!app) return texto("not found", 404);

  const rawBody = await req.text();
  if (rawBody.length > TAMANHO_MAXIMO_DO_CORPO || !verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), app.appSecret)) {
    logger.warn("[webhooks.messenger] assinatura recusada", { tamanho: rawBody.length });
    return texto("invalid signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return texto("ok", 200);
  }

  const eventos = eventosDoAviso(payload, app.appId);
  if (eventos.length === 0) return texto("ok", 200);

  try {
    await ingerirAviso(createAdminClient(), { rawBody, headers: req.headers, eventos });
    return texto("ok", 200);
  } catch (err) {
    logger.error("[webhooks.messenger] aviso não gravado — a Meta vai reentregar", {
      erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
    });
    return texto("retry", 500);
  }
}
