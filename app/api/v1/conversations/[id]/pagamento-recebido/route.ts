import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * /api/v1/conversations/[id]/pagamento-recebido — a pessoa pagou por fora do checkout.
 *
 *   GET  → os produtos que a organização vende, com o valor de cada um, para o diálogo oferecer
 *          em lista (ninguém digita nome de produto).
 *   POST → registra o pagamento: marca o contato como pago, fecha o negócio com o valor (é o que
 *          reporta a venda à plataforma de anúncio) e, se pedido, inicia a entrega.
 *
 * A regra mora em `lib/pagamentos/pagamento-recebido.ts`, com o caso que a originou.
 *
 * Auth: cookie de sessão, agent+ (escrita é agent+; viewer só lê). A conversa é lida com o client
 * do PEDIDO: é a política de leitura que aplica a visibilidade, e ler com service role deixaria
 * alguém registrar pagamento numa conversa que não enxerga. As escritas usam service role com a
 * organização da sessão — a mesma forma do aviso do checkout.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { encerraDemanda } from "@/lib/leads/encerramento";
import { logger } from "@/lib/logger";
import {
  depsReaisDoPagamento,
  pagamentoRecebidoSchema,
  registrarPagamentoRecebido,
  sugestoesDePagamento,
} from "@/lib/pagamentos/pagamento-recebido";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, _ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  // ⚠️ Filtro de organização: o client é service-role e ignora RLS.
  const { data, error } = await createAdminClient()
    .from("ai_agents")
    .select("config")
    .eq("organization_id", authz.org.orgId)
    .is("archived_at", null)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .limit(20);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok({ sugestoes: sugestoesDePagamento(((data ?? []) as Array<{ config: unknown }>).map((a) => a.config)) }, { requestId });
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
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
  const lido = pagamentoRecebidoSchema.safeParse(corpo);
  if (!lido.success) {
    return fail("validation_failed", t("Confira o valor e o produto do pagamento."), 422, {
      requestId,
      details: { campos: lido.error.issues.map((i) => i.path.join(".")) },
    });
  }

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

  const deps = depsReaisDoPagamento(createAdminClient(), {
    organizationId: org.orgId,
    requestId,
    userId: user.id,
    // Fecha pela MESMA regra do botão Ganhar: é ela que move para a etapa de ganho e emite o evento
    // que reporta a venda. Não fechar não desfaz o registro — o pagamento já entrou.
    fecharComoGanho: async (leadId) => {
      try {
        await encerraDemanda(
          supabase,
          { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId, idioma: user.idioma },
          { leadId, desfecho: "won" },
        );
        return true;
      } catch (err) {
        logger.warn("[pagamento-recebido] o negócio não fechou como ganho", {
          organization_id: org.orgId,
          lead_id: leadId,
          motivo: err instanceof ApiError ? err.code : err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    },
  });

  const resultado = await registrarPagamentoRecebido(deps, { contatoId: conv.contact_id, pagamento: lido.data, agora: new Date() });
  if (resultado.resultado === "contato_nao_encontrado") return fail("not_found", t("Contato não encontrado."), 404, { requestId });

  if (resultado.resultado === "registrado") {
    await audit({
      action: "payment.manual_registered",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "conversation",
      resourceId: id,
      requestId,
      // Sem nome de produto nem de pessoa: o que a auditoria precisa é quanto, como e o desfecho.
      metadata: {
        valor_cents: lido.data.valor_cents,
        metodo: lido.data.metodo,
        negocio: resultado.negocio,
        entrega: resultado.entrega,
      },
    });
  }
  return ok(resultado, { requestId });
}
