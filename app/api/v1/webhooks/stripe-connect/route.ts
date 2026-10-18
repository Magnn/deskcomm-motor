/**
 * O AVISO DA STRIPE PARA AS CONTAS CONECTADAS — um endereço só, da plataforma, para todas as empresas que
 * usaram "Conectar com Stripe".
 *
 * Registrado pela instalação com `connect=true` (`criarAvisoDaPlataforma`, ao conectar a primeira empresa). A
 * Stripe manda aqui os eventos de TODAS as contas conectadas, e cada evento traz `account`: é por ela que se
 * acha a empresa (`payment_gateway_connections.stripe_account_id`). O segredo da assinatura é o mesmo para
 * todas e fica guardado, cifrado, em cada linha conectada.
 *
 * Autenticação: o corpo é lido só para saber de que conta é o evento; NADA tem efeito antes de a assinatura
 * `Stripe-Signature` conferir com o segredo daquela linha. A organização sai da linha, nunca do corpo.
 *
 * Eventos:
 *   - `account.updated`: a conta mudou de situação (cadastro aprovado, pendência nova) → `stripe_pronta`.
 *   - `payment_intent.succeeded`: a venda da empresa foi paga → mesmo efeito do aviso por chave colada
 *     (`aplicarAvisoDePagamentoDaStripe`).
 */
import { type NextRequest, type NextResponse } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import {
  aplicarAvisoDePagamentoDaStripe,
  eventoDaStripeSchema,
} from "@/lib/pagamentos/aviso-de-pagamento-da-stripe";
import {
  lerAvisoDaContaConectada,
  lerConexaoStripePorConta,
} from "@/lib/pagamentos/conexao-stripe";
import { assinaturaDaStripeConfere } from "@/lib/pagamentos/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  if (!req.headers.get("stripe-signature"))
    return fail("unauthorized", "Assinatura inválida.", 401, { requestId }) as NextResponse;
  const corpoCru = await req.text();
  if (corpoCru.length > 512 * 1024)
    return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;

  let corpo: unknown;
  try {
    corpo = JSON.parse(corpoCru);
  } catch {
    return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;
  }
  const parsed = eventoDaStripeSchema.safeParse(corpo);
  if (!parsed.success)
    return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;
  const evento = parsed.data;
  const conta = typeof evento.account === "string" ? evento.account : "";

  const admin = createAdminClient();
  const aviso = await lerAvisoDaContaConectada(admin, conta);
  // Conta desconhecida (outra instalação, ou a empresa desconectou) e assinatura errada respondem igual: nada
  // se aprende sobre quais contas existem aqui.
  if (
    !aviso?.segredoDoAviso ||
    !assinaturaDaStripeConfere(
      corpoCru,
      req.headers.get("stripe-signature"),
      aviso.segredoDoAviso,
      new Date(),
    )
  ) {
    return fail("unauthorized", "Assinatura inválida.", 401, { requestId }) as NextResponse;
  }
  // Mesmo teto por conexão do webhook de captação. Só eventos autenticados consomem o balde da empresa.
  const limite = await checkRateLimit(`stripe-connect:${aviso.id}`, 60, 60);
  if (!limite.allowed)
    return fail("rate_limited", "Muitos avisos. Tente novamente.", 429, {
      requestId,
      headers: { "Retry-After": "60" },
    }) as NextResponse;

  if (evento.type === "account.updated") {
    const objeto = z
      .object({ id: z.literal(conta), charges_enabled: z.boolean() })
      .safeParse(evento.data?.object);
    if (!objeto.success)
      return fail("validation_failed", "Conta inválida.", 400, { requestId }) as NextResponse;
    const pronta = objeto.data.charges_enabled;
    // ⚠️ Filtro de organização: o client é service-role.
    const { error } = await admin
      .from("payment_gateway_connections")
      .update({ stripe_pronta: pronta })
      .eq("organization_id", aviso.organizationId)
      .eq("id", aviso.id);
    if (error) {
      logger.error("[stripe.connect] situação da conta não gravou", {
        requestId,
        error: error.message,
      });
      return fail("internal_error", "Falha ao gravar.", 500, { requestId }) as NextResponse;
    }
    await audit({
      action: "payment_gateway_connection.updated",
      organizationId: aviso.organizationId,
      resourceType: "payment_gateway_connections",
      resourceId: aviso.id,
      requestId,
      metadata: { provider: "stripe", origem: "account.updated", stripe_pronta: pronta },
    });
    return ok(
      { received: true, resultado: pronta ? "pronta" : "pendente" },
      { requestId },
    ) as NextResponse;
  }

  if (evento.type !== "payment_intent.succeeded")
    return ok({ received: true, resultado: "ignorada" }, { requestId }) as NextResponse;

  const conexao = await lerConexaoStripePorConta(admin, conta);
  // A conta já foi reconhecida e a assinatura conferiu. Falha ao ler a credencial deve pedir reentrega,
  // nunca confirmar recebimento sem aplicar uma venda paga.
  if (!conexao)
    return fail("internal_error", "Conexão indisponível. Tente novamente.", 503, {
      requestId,
    }) as NextResponse;
  return aplicarAvisoDePagamentoDaStripe(admin, conexao, evento, requestId);
}
