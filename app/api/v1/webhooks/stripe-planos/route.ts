/**
 * POST /api/v1/webhooks/stripe-planos — o aviso da Stripe sobre a ASSINATURA DE UM PLANO.
 *
 * É o endereço cadastrado na conta Stripe do dono da instalação (a que recebe o plano de cada empresa).
 * Não confundir com `/api/v1/webhooks/stripe/[conexao]`, que é o aviso da Stripe de CADA empresa (Pix na
 * conversa).
 *
 * A porta nasce FECHADA: sem `STRIPE_PLANS_SECRET_KEY` e `STRIPE_PLANS_WEBHOOK_SECRET`, 404. A assinatura
 * `Stripe-Signature` é conferida antes de qualquer leitura do corpo. A regra mora em
 * `lib/planos/aviso-da-stripe-dos-planos.ts`.
 *
 * Resposta: 200 para todo aviso autêntico, inclusive o que não muda nada (a Stripe reenvia por até 3 dias
 * o que não recebe 2xx). Erro de banco ou da Stripe responde 500 — aí o reenvio é o que queremos.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { assinaturaDaStripeConfere } from "@/lib/pagamentos/stripe";
import { aplicarAvisoDaStripeDosPlanos } from "@/lib/planos/aviso-da-stripe-dos-planos";
import { configuracaoDaStripeDosPlanos, criarStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Um aviso da Stripe tem poucos KB; acima disto não é ela. */
const TAMANHO_MAXIMO_DO_CORPO = 512 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = req.headers.get("x-request-id") ?? randomUUID();
  const cfg = configuracaoDaStripeDosPlanos();
  if (!cfg || cfg.segredoDoAviso === "") return fail("not_found", "Not found.", 404, { requestId });

  const corpoCru = await req.text();
  if (corpoCru.length > TAMANHO_MAXIMO_DO_CORPO) return fail("unauthenticated", "Assinatura inválida.", 401, { requestId });
  if (!assinaturaDaStripeConfere(corpoCru, req.headers.get("stripe-signature"), cfg.segredoDoAviso, new Date())) {
    return fail("unauthenticated", "Assinatura inválida.", 401, { requestId });
  }

  let evento: { id?: unknown; type?: unknown; data?: { object?: unknown } };
  try {
    evento = JSON.parse(corpoCru) as typeof evento;
  } catch {
    return ok({ resultado: "ignorado", motivo: "corpo_ilegivel" }, { requestId });
  }

  try {
    const stripe = criarStripeDosPlanos(cfg);
    const desfecho = await aplicarAvisoDaStripeDosPlanos(
      evento,
      { admin: createAdminClient(), lerAssinatura: (id) => stripe.lerAssinatura(id) },
      requestId,
    );
    logger.info("[planos.stripe] aviso aplicado", { requestId, evento: evento.id, tipo: evento.type, ...desfecho });
    return ok(desfecho, { requestId, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    logger.error("[planos.stripe] aviso falhou — a Stripe vai reenviar", {
      requestId,
      evento: evento.id,
      tipo: evento.type,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Falha ao aplicar o aviso.", 500, { requestId });
  }
}
