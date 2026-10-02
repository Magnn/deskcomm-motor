/**
 * /api/v1/webhooks/instagram — os avisos que o Instagram manda para o app.
 *
 *   GET  → o handshake: a Meta chama com `hub.verify_token` ao cadastrar o
 *          webhook, e só o token certo recebe o `hub.challenge` de volta.
 *   POST → os avisos. A origem é conferida pela assinatura do corpo CRU
 *          (`X-Hub-Signature-256`, segredo do app) ANTES de qualquer leitura.
 *
 * Hoje o que tem efeito é o aviso de COMENTÁRIO: cada um passa pelas regras de
 * "comentou, recebe direct" (`lib/channels/instagram/comentarios.ts`). Os demais
 * (direct recebido, menção…) são aceitos com 200 e ignorados.
 *
 * A organização vem da CONTA que recebeu o comentário (`entry.id`), achada no
 * banco — nunca de um campo do corpo.
 *
 * Responde 200 mesmo quando um comentário falha por dentro: a Meta reentrega o
 * aviso em caso de erro, e o comentário já registrado seria reconhecido como
 * repetido — repetir não conserta, só gasta. O erro fica no registro e no log.
 */
import type { NextRequest } from "next/server";

import { appDoInstagram, assinaturaDoAvisoConfere, tokenDeVerificacaoConfere } from "@/lib/channels/instagram/app";
import { atenderComentario, comentariosDoAviso } from "@/lib/channels/instagram/comentarios";
import { depsReaisDosComentarios } from "@/lib/channels/instagram/repositorio";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Um aviso tem poucos KB; acima disto não é a Meta. */
const TAMANHO_MAXIMO_DO_CORPO = 512 * 1024;

const texto = (corpo: string, status: number) => new Response(corpo, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(req: NextRequest): Promise<Response> {
  const app = appDoInstagram();
  if (!app) return texto("not found", 404);
  const q = new URL(req.url).searchParams;
  if (q.get("hub.mode") !== "subscribe" || !tokenDeVerificacaoConfere(q.get("hub.verify_token"), app.verifyToken)) {
    return texto("forbidden", 403);
  }
  return texto(q.get("hub.challenge") ?? "", 200);
}

export async function POST(req: NextRequest): Promise<Response> {
  const app = appDoInstagram();
  if (!app) return texto("not found", 404);

  const corpoCru = await req.text();
  if (corpoCru.length > TAMANHO_MAXIMO_DO_CORPO || !assinaturaDoAvisoConfere(corpoCru, req.headers.get("x-hub-signature-256"), app.appSecret)) {
    return texto("invalid signature", 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(corpoCru);
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
          logger.info("[webhooks.instagram] comentário atendido", { conta: comentario.contaId, dm: r.dm, publica: r.publica });
        }
      } catch (err) {
        logger.error("[webhooks.instagram] comentário não pôde ser atendido", {
          conta: comentario.contaId,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  return texto("ok", 200);
}
