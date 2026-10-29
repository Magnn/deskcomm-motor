import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/conversations/[id]/bloqueio  { bloquear: boolean }
 *
 * A VERIFICAÇÃO MANUAL do bloqueio, a partir do chat.
 *
 * O bloqueio (`contacts.is_blocked`) só nascia sozinho — `lib/channels/pos-entrada.ts` o grava na
 * ingestão quando a mensagem casa um pedido inequívoco de descadastro — e não havia porta de volta: o
 * aviso da Central dizia "confirmar bloqueio do contato no CRM" e nenhuma tela tinha onde confirmar.
 * Medido em 29/10/2026: "tirar ele do pensamento e parar de insistir" (a cliente falando do homem
 * dela) bloqueou uma conversa de venda, e desfazer exigiu SQL no banco de produção.
 *
 * Agora quem atende decide, nos dois sentidos:
 *   - bloquear: o cliente pediu para sair de um jeito que a detecção não pegou;
 *   - desbloquear: a detecção errou. Desbloquear NÃO religa o automático — se a conversa estiver
 *     pausada, o "Devolver ao automático" aparece ao lado e é o segundo gesto, consciente.
 *
 * Auth: cookie de sessão, agent+. A conversa é lida com o client do PEDIDO (a política de leitura
 * aplica a visibilidade); a escrita no contato usa service role com a organização da sessão.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const corpoSchema = z.object({ bloquear: z.boolean() });

/** O motivo gravado quando é uma pessoa que bloqueia — o automático grava `stop_keyword`. */
const MOTIVO_DO_BLOQUEIO_MANUAL = "manual";

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
  const lido = corpoSchema.safeParse(corpo);
  if (!lido.success) return fail("validation_failed", t("Diga se é para bloquear ou desbloquear."), 422, { requestId });
  const { bloquear } = lido.data;

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
  if (!conv.contact_id) return fail("validation_failed", t("Esta conversa não tem um contato."), 422, { requestId });

  // ⚠️ Filtro de organização: o client é service-role e ignora RLS.
  const { data: antes, error: lerErr } = await createAdminClient()
    .from("contacts")
    .select("is_blocked, blocked_reason")
    .eq("organization_id", org.orgId)
    .eq("id", conv.contact_id)
    .maybeSingle();
  if (lerErr) return fail("internal_error", lerErr.message, 500, { requestId });
  if (!antes) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  const anterior = antes as { is_blocked: boolean | null; blocked_reason: string | null };

  const { error: gravarErr } = await createAdminClient()
    .from("contacts")
    .update(
      bloquear
        ? { is_blocked: true, blocked_reason: MOTIVO_DO_BLOQUEIO_MANUAL, blocked_at: new Date().toISOString() }
        : { is_blocked: false, blocked_reason: null, blocked_at: null },
    )
    .eq("organization_id", org.orgId)
    .eq("id", conv.contact_id);
  if (gravarErr) return fail("internal_error", gravarErr.message, 500, { requestId });

  await audit({
    action: bloquear ? "contact.bloqueado_manual" : "contact.desbloqueado_manual",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "contact",
    resourceId: conv.contact_id,
    requestId,
    // O motivo anterior é o que diz se a pessoa corrigiu o automático (`stop_keyword`) ou outra pessoa.
    metadata: { conversa: id, estava_bloqueado: anterior.is_blocked === true, motivo_anterior: anterior.blocked_reason },
  });

  return ok({ bloqueado: bloquear }, { requestId });
}
