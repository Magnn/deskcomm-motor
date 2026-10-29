import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/pix — o atendente envia um Pix "copia e cola" na conversa.
 *
 * Medido em produção em 11/10/2026: numa conversa atendida à mão, a venda estava fechada e não havia como
 * mandar o Pix pelo sistema — o código foi gerado por fora e colado. Aqui o atendente informa o valor e o
 * produto; a cobrança nasce com os mesmos metadados do envio automático (`pix-no-envio.ts`), então o aviso de
 * pagamento marca o contato como pago e inicia a entrega do mesmo jeito.
 *
 * Auth: cookie de sessão, agent+. A conversa é lida com o client do PEDIDO (a política de leitura aplica a
 * visibilidade); a chave do provedor é lida com service role, pela organização da sessão. As duas mensagens
 * saem pelo MESMO caminho de qualquer resposta do atendente (`sendMessageHandler`): histórico, janela de 24 h
 * e silêncio da IA valem como sempre.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { lerConexaoStripe } from "@/lib/pagamentos/conexao-stripe";
import { enviarPixSchema, mensagensDoPix } from "@/lib/pagamentos/enviar-pix-tipos";
import { VALIDADE_DO_PIX_S } from "@/lib/pagamentos/pix-na-conversa";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }
  const lido = enviarPixSchema.safeParse(corpo);
  if (!lido.success) return fail("validation_failed", t("Confira o valor e o produto do Pix."), 422, { requestId });

  const supabase = await createClient();
  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  const conv = convData as { id: string; contact_id: string | null } | null;
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  if (!conv.contact_id) return fail("validation_failed", t("Esta conversa não tem um contato para receber o pagamento."), 422, { requestId });

  const conexao = await lerConexaoStripe(createAdminClient(), org.orgId);
  if (conexao === null) {
    return fail("validation_failed", t("Nenhuma conta de Pix conectada. Conecte a Stripe em Configurações › Pagamentos."), 422, { requestId });
  }

  let pix;
  try {
    pix = await criarClienteStripe(conexao).criarPix({
      valorCentavos: lido.data.valor_cents,
      descricao: lido.data.produto,
      // Um pedido, uma cobrança: reenviar o mesmo formulário não cria outra.
      referencia: `pix-manual-${requestId}`,
      metadados: {
        organization_id: org.orgId,
        contact_id: conv.contact_id,
        conversation_id: conv.id,
        produto: lido.data.produto,
        // Cobrança avulsa: o aviso de pagamento lê `extra` (receita própria, marca `extra:<id>`, mesa da pergunta).
        ...(lido.data.extra ? { extra: lido.data.extra } : {}),
      },
      expiraEmSegundos: VALIDADE_DO_PIX_S,
    });
  } catch (err) {
    const codigo = err instanceof ErroDaStripe ? err.codigo : "falha";
    logger.warn("[enviar-pix] a cobrança não foi criada", { organization_id: org.orgId, requestId, motivo: codigo });
    return fail(
      "provider_error",
      codigo === "pix_indisponivel"
        ? t("O Pix não está ativo na conta da Stripe conectada.")
        : t("Não consegui gerar o Pix agora. Tente de novo em instantes."),
      502,
      { requestId },
    );
  }

  try {
    for (const body of mensagensDoPix(lido.data.valor_cents, pix.copiaECola)) {
      await sendMessageHandler(
        supabase,
        { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId, idioma: user.idioma },
        { conversation_id: conv.id, type: "text", body } as never,
      );
    }
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    return fail("internal_error", t("O Pix foi gerado, mas a mensagem não saiu. Tente de novo."), 500, { requestId });
  }

  await audit({
    action: "payment.pix_sent",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: id,
    requestId,
    // Quanto e qual cobrança; nome de produto e de pessoa ficam de fora.
    metadata: { valor_cents: lido.data.valor_cents, cobranca: pix.id },
  });
  return ok({ cobranca: pix.id, valor_cents: lido.data.valor_cents }, { requestId });
}
