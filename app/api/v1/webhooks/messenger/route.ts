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
 *
 * O INSTAGRAM ligado às páginas chega aqui também (`object: "instagram"`, 0968):
 * o direct segue o caminho das mensagens; o COMENTÁRIO passa pelas regras de
 * "comentou, recebe direct" (as mesmas da conta conectada pelo login do
 * Instagram), achando a conta pelo `entry.id` no banco. O comentário que falha
 * por dentro responde 200 como na rota do Instagram: ele fica registrado e a
 * reentrega só o reconheceria como repetido.
 */
import type { NextRequest } from "next/server";

import { atenderComentario, comentariosDoAviso } from "@/lib/channels/instagram/comentarios";
import { depsReaisDosComentarios } from "@/lib/channels/instagram/repositorio";
import { appDoMessenger } from "@/lib/channels/messenger/app";
import { ingerirAviso } from "@/lib/channels/messenger/ingest";
import { eventosDoAviso } from "@/lib/channels/messenger/parser";
import { chavesQueAssinamAvisos, idsDosAppsDaInstalacao } from "@/lib/channels/meta/app";
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
  const app = await appDoMessenger(null);
  if (!app) return texto("not found", 404);
  const challenge = verificationChallenge(new URL(req.url).searchParams, app.verifyToken);
  if (challenge === null) return texto("forbidden", 403);
  return texto(challenge, 200);
}

export async function POST(req: NextRequest): Promise<Response> {
  const app = await appDoMessenger(null);
  if (!app) return texto("not found", 404);

  // Cada app assina com a chave DELE (0967: a página pode ter entrado por um app
  // conectado ao lado do principal) — a mesma regra do webhook do WhatsApp.
  const rawBody = await req.text();
  const assinatura = req.headers.get("x-hub-signature-256");
  const chaves = await chavesQueAssinamAvisos();
  if (rawBody.length > TAMANHO_MAXIMO_DO_CORPO || !chaves.some((chave) => verifyMetaSignature(rawBody, assinatura, chave))) {
    logger.warn("[webhooks.messenger] assinatura recusada", { tamanho: rawBody.length });
    return texto("invalid signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return texto("ok", 200);
  }

  const comentarios = comentariosDoAviso(payload);
  if (comentarios.length > 0) {
    const deps = depsReaisDosComentarios(createAdminClient());
    for (const comentario of comentarios) {
      try {
        const r = await atenderComentario(deps, comentario);
        if (r.resultado === "atendido") {
          logger.info("[webhooks.messenger] comentário do Instagram atendido", { conta: comentario.contaId, dm: r.dm, publica: r.publica });
        }
      } catch (err) {
        logger.error("[webhooks.messenger] comentário do Instagram não pôde ser atendido", {
          conta: comentario.contaId,
          erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
        });
      }
    }
  }

  const { principal, outros } = await idsDosAppsDaInstalacao();
  const eventos = eventosDoAviso(payload, [principal ?? app.appId, ...outros]);
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
