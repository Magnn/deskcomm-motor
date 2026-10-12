/**
 * O AVISO DE PAGAMENTO DA STRIPE — o Pix gerado na conversa foi pago.
 *
 * Autenticação: o `[conexao]` do endereço escolhe a conexão (e, por ela, a organização — nunca o corpo), e a
 * assinatura `Stripe-Signature` é conferida com o segredo guardado daquela conexão. Sem assinatura válida,
 * nada é lido do corpo.
 *
 * O efeito é o MESMO de uma compra aprovada no checkout (`aplicarEventoDaCakto`): marca o contato como pago,
 * grava o valor no negócio, tira a pessoa das retomadas e inicia o fluxo de entrega do produto. A diferença é
 * só quem é a pessoa: aqui ela vem do `metadata.contact_id` que o turno gravou ao criar a cobrança, e não de um
 * telefone digitado num checkout.
 *
 * Moeda: a cobrança de quem escreve de fora do país é em euro ou dólar (`lib/preco/preco-internacional.ts`). O
 * negócio, a receita e a conversão enviada ao anúncio são na moeda da conta, então o valor que entra é o que a
 * Stripe converteu (`lerValorConvertido`). Se a conversão não puder ser lida, a compra é aplicada do mesmo jeito
 * — a entrega não espera câmbio — e a receita fica registrada na moeda original, sem valor no negócio.
 *
 * Idempotência: a Stripe reentrega. A marca `compra:<id da cobrança>` no contato e a chave única do ledger
 * fazem a segunda entrega não repetir nada.
 */
import { type NextRequest, type NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { aplicarEventoDaCakto, depsReais } from "@/lib/pagamentos/compra-cakto";
import { lerConexaoStripePorId } from "@/lib/pagamentos/conexao-stripe";
import { assinaturaDaStripeConfere, criarClienteStripe } from "@/lib/pagamentos/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CompraDaCakto } from "@/lib/webhooks/cakto";

export const dynamic = "force-dynamic";

/** A moeda em que o negócio, a receita e os anúncios são contados. */
const MOEDA_DA_CONTA = "BRL";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ conexao: string }> }): Promise<NextResponse> {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const { conexao: conexaoId } = await ctx.params;
  if (!UUID.test(conexaoId)) return fail("not_found", "Endereço desconhecido.", 404, { requestId }) as NextResponse;

  const corpoCru = await req.text();
  const admin = createAdminClient();
  const conexao = await lerConexaoStripePorId(admin, conexaoId);
  if (!conexao?.segredoDoAviso) return fail("not_found", "Endereço desconhecido.", 404, { requestId }) as NextResponse;
  if (!assinaturaDaStripeConfere(corpoCru, req.headers.get("stripe-signature"), conexao.segredoDoAviso, new Date())) {
    return fail("unauthorized", "Assinatura inválida.", 401, { requestId }) as NextResponse;
  }

  let evento: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    evento = JSON.parse(corpoCru);
  } catch {
    return fail("validation_failed", "Corpo inválido.", 400, { requestId }) as NextResponse;
  }
  // Só o pagamento confirmado tem efeito; o resto é recebido e ignorado (a Stripe não deve reentregar).
  if (evento.type !== "payment_intent.succeeded") return ok({ received: true, resultado: "ignorada" }, { requestId }) as NextResponse;

  const pi = evento.data?.object ?? {};
  const meta = (pi.metadata ?? {}) as Record<string, string>;
  const contatoId = meta.contact_id;
  const valor = typeof pi.amount_received === "number" ? pi.amount_received : typeof pi.amount === "number" ? pi.amount : null;
  // Cobrança que não nasceu na conversa (sem os nossos metadados) ou de outra organização: não é desta casa.
  if (!contatoId || !UUID.test(contatoId) || meta.organization_id !== conexao.organizationId || valor === null || valor <= 0) {
    return ok({ received: true, resultado: "ignorada" }, { requestId }) as NextResponse;
  }
  const cobrancaId = String(pi.id ?? evento.id ?? "");
  const pagoEm = new Date().toISOString();
  const moedaDaCobranca = typeof pi.currency === "string" ? pi.currency.toUpperCase() : MOEDA_DA_CONTA;
  const porPix = Array.isArray(pi.payment_method_types) && pi.payment_method_types.includes("pix");
  // Na moeda da conta o valor é o da cobrança. Em outra moeda, é o que a Stripe converteu — ou nenhum.
  let valorNaConta: number | null = moedaDaCobranca === MOEDA_DA_CONTA ? valor : null;
  if (valorNaConta === null) {
    try {
      const convertido = await criarClienteStripe({ chave: conexao.chave }).lerValorConvertido(cobrancaId);
      if (convertido?.moeda === MOEDA_DA_CONTA) valorNaConta = convertido.valorCentavos;
    } catch (err) {
      logger.warn("[stripe.aviso] conversão não lida — receita fica na moeda original", {
        requestId,
        error: (err instanceof Error ? err.message : String(err)).slice(0, 160),
      });
    }
  }
  const compra: CompraDaCakto = {
    evento: "purchase_approved",
    pedidoId: cobrancaId,
    refId: null,
    produtoId: null,
    produtoNome: meta.produto || null,
    ofertaNome: null,
    valorCentavos: valorNaConta,
    cupom: null,
    metodo: porPix ? "pix" : "cartao",
    pagoEm,
    status: "paid",
    cliente: { nome: null, email: null, telefone: null },
  };

  try {
    const base = depsReais(admin, conexao.organizationId, requestId, conexao.id);
    const efeito = await aplicarEventoDaCakto(
      {
        ...base,
        // A pessoa é a do metadado da cobrança. ⚠️ Filtro de organização: o client é service-role.
        async acharContato() {
          const { data } = await admin
            .from("contacts")
            .select("id, tags")
            .eq("organization_id", conexao.organizationId)
            .eq("id", contatoId)
            .maybeSingle();
          const c = data as { id: string; tags: string[] | null } | null;
          return c === null ? null : { id: c.id, tags: c.tags ?? [] };
        },
      },
      compra,
    );

    const { error: erroDoLedger } = await admin.from("revenue_ledger").insert({
      organization_id: conexao.organizationId,
      event_type: "charge",
      amount_cents: valorNaConta ?? valor,
      currency: valorNaConta === null ? moedaDaCobranca : MOEDA_DA_CONTA,
      provider: "stripe",
      external_event_id: cobrancaId,
      occurred_at: pagoEm,
      contact_id: "contatoId" in efeito ? efeito.contatoId : null,
      metadata: {
        produto: meta.produto ?? null,
        metodo: porPix ? "pix" : "cartao",
        conversa: meta.conversation_id ?? null,
        ...(moedaDaCobranca !== MOEDA_DA_CONTA ? { moeda_original: moedaDaCobranca, valor_original_cents: valor } : {}),
      },
    });
    if (erroDoLedger && erroDoLedger.code !== "23505") {
      logger.error("[stripe.aviso] ledger não gravou", { requestId, error: erroDoLedger.message });
    }

    if (efeito.resultado !== "ignorada") {
      await audit({
        action: "webhook.cakto_evento_aplicado",
        organizationId: conexao.organizationId,
        resourceType: "payment_gateway_connections",
        resourceId: conexao.id,
        requestId,
        metadata: { provedor: "stripe", evento: "payment_intent.succeeded", resultado: efeito.resultado, pedido: cobrancaId, valor_centavos: valorNaConta, moeda_da_cobranca: moedaDaCobranca },
      });
    }
    return ok({ received: true, resultado: efeito.resultado }, { requestId }) as NextResponse;
  } catch (err) {
    // 500 faz a Stripe reentregar: a compra não pode se perder por uma falha passageira nossa.
    logger.error("[stripe.aviso] falha ao aplicar o pagamento", { requestId, error: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "Falha ao aplicar o pagamento.", 500, { requestId }) as NextResponse;
  }
}
