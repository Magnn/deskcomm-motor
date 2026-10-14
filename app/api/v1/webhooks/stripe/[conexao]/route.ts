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
 * Cobrança avulsa (`lib/preco/extras.ts`): a cobrança que traz `metadata.extra` NÃO é a compra do produto
 * principal. Ela só entra no livro de receita, com o nome do extra, e marca o contato com `extra:<nome>` — sem
 * `pago`, sem valor no negócio e sem fluxo de entrega. É o turno seguinte do agente que lê esse pagamento.
 *
 * Idempotência: a Stripe reentrega. A marca `compra:<id da cobrança>` no contato e a chave única do ledger
 * fazem a segunda entrega não repetir nada.
 */
import { type NextRequest, type NextResponse } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { logger } from "@/lib/logger";
import { aplicarEventoDaCakto, depsReais } from "@/lib/pagamentos/compra-cakto";
import { reportarCompraAvulsa } from "@/lib/conversoes/compra-avulsa";
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
  const tipos = Array.isArray(pi.payment_method_types) ? (pi.payment_method_types as unknown[]) : [];
  // Cobrança de uma forma só diz qual foi; o link que aceita várias (boleto e cartão) fica como cartão.
  const metodoDaCobranca = tipos.length === 1 && tipos[0] === "pix" ? "pix" : tipos.length === 1 && tipos[0] === "boleto" ? "boleto" : "cartao";
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
    metodo: metodoDaCobranca,
    pagoEm,
    status: "paid",
    cliente: { nome: null, email: null, telefone: null },
  };

  const extra = typeof meta.extra === "string" && /^[a-z0-9-]{1,60}$/.test(meta.extra) ? meta.extra : null;
  if (extra !== null) {
    try {
      const { error: erroDoLedger } = await admin.from("revenue_ledger").insert({
        organization_id: conexao.organizationId,
        event_type: "charge",
        amount_cents: valorNaConta ?? valor,
        currency: valorNaConta === null ? moedaDaCobranca : MOEDA_DA_CONTA,
        provider: "stripe",
        external_event_id: cobrancaId,
        occurred_at: pagoEm,
        contact_id: contatoId,
        metadata: { produto: meta.produto ?? null, metodo: metodoDaCobranca, conversa: meta.conversation_id ?? null, extra },
      });
      // Reentrega da Stripe: a receita já está lá e a marca também.
      if (erroDoLedger?.code === "23505") return ok({ received: true, resultado: "repetida" }, { requestId }) as NextResponse;
      if (erroDoLedger) throw new Error(erroDoLedger.message);
      // ⚠️ Filtro de organização: o client é service-role.
      const { data: contato } = await admin
        .from("contacts")
        .select("id, tags")
        .eq("organization_id", conexao.organizationId)
        .eq("id", contatoId)
        .maybeSingle();
      const tags = ((contato as { tags: string[] | null } | null)?.tags ?? []) as string[];
      const marca = `extra:${extra}`;
      if (contato && !tags.includes(marca)) {
        await admin.from("contacts").update({ tags: [...tags, marca] }).eq("organization_id", conexao.organizationId).eq("id", contatoId);
      }
      // A compra avulsa vai à plataforma de anúncio que trouxe o lead (`lib/conversoes/compra-avulsa.ts`). Nunca
      // lança: receita registrada não falha por causa do anúncio.
      const reportada = await reportarCompraAvulsa(admin, {
        organizationId: conexao.organizationId,
        contactId: contatoId,
        referencia: cobrancaId,
        valorCentavos: valorNaConta ?? valor,
        moeda: valorNaConta === null ? moedaDaCobranca : MOEDA_DA_CONTA,
        ocorridaEm: new Date(pagoEm),
        produto: typeof meta.produto === "string" ? meta.produto : null,
      });
      if (reportada.status === "error") logger.warn("[stripe.aviso] compra avulsa não foi reportada à plataforma de anúncio", { requestId, motivo: reportada.motivo });
      // Quem acabou de pagar não pode esperar escrever de novo para ser atendido: pede um turno do agente sobre a
      // última mensagem dela (o mesmo pedido que o resgate do lead sem resposta emite). Falha aqui não desfaz o
      // registro do pagamento.
      try {
        const conversaId = typeof meta.conversation_id === "string" ? meta.conversation_id : null;
        if (conversaId !== null) {
          const { data: ultima } = await admin
            .from("messages")
            .select("id, channel_session_id")
            .eq("organization_id", conexao.organizationId)
            .eq("conversation_id", conversaId)
            .eq("direction", "inbound")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          const m = ultima as { id: string; channel_session_id: string | null } | null;
          if (m) {
            await admin.rpc("emit_event", {
              p_event_type: "ai_agent.dispatch_requested",
              p_entity_kind: "message",
              p_entity_id: m.id,
              p_payload: {
                organization_id: conexao.organizationId,
                conversation_id: conversaId,
                contact_id: contatoId,
                channel_session_id: m.channel_session_id,
                inbound_message_id: m.id,
                // Sem isto o turno é pulado: a última mensagem dela quase sempre já foi respondida (com o código do Pix).
                fato_novo: "pagamento_de_extra",
              },
              p_metadata: { source: "pagamento_de_extra" },
              p_organization_id: conexao.organizationId,
            });
          }
        }
      } catch (err) {
        logger.warn("[stripe.aviso] extra pago, mas o turno do agente não foi pedido", { requestId, error: err instanceof Error ? err.message : String(err) });
      }
      await audit({
        action: "webhook.cakto_evento_aplicado",
        organizationId: conexao.organizationId,
        resourceType: "payment_gateway_connections",
        resourceId: conexao.id,
        requestId,
        metadata: { provedor: "stripe", evento: "payment_intent.succeeded", resultado: "cobranca_avulsa", pedido: cobrancaId, valor_centavos: valorNaConta, extra },
      });
      return ok({ received: true, resultado: "cobranca_avulsa" }, { requestId }) as NextResponse;
    } catch (err) {
      logger.error("[stripe.aviso] falha ao registrar a cobrança avulsa", { requestId, error: err instanceof Error ? err.message : String(err) });
      return fail("internal_error", "Falha ao aplicar o pagamento.", 500, { requestId }) as NextResponse;
    }
  }

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
        metodo: metodoDaCobranca,
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
