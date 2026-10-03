/**
 * PATCH /api/v1/resultado/perdas/[conversationId] (manager+) — CORRIGIR o motivo
 * da perda. A correção vence a inferência e fica marcada como humana: uma nova
 * análise não a reescreve.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { corrigirMotivo, MOTIVOS } from "@/lib/resultado/motivo-da-perda";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpo = z.object({ motivo: z.enum(MOTIVOS) }).strict();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ conversationId: string }> }): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const { conversationId } = await ctx.params;
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!UUID.test(conversationId) || !lido.success) return fail("invalid_request", t("Motivo inválido."), 400, { requestId });

  try {
    const feito = await corrigirMotivo(createAdminClient(), {
      organizationId: auth.org.orgId,
      conversationId,
      motivo: lido.data.motivo,
      userId: auth.user.id,
      agora: new Date(),
    });
    if (!feito) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
    void audit({
      action: "resultado.motivo_corrigido",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "conversation",
      resourceId: conversationId,
      requestId,
      metadata: { motivo: lido.data.motivo },
    });
    return ok({ conversaId: conversationId, motivo: lido.data.motivo, origem: "humano" }, { requestId });
  } catch (err) {
    logger.error("[resultado.perdas] correção falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível corrigir o motivo."), 500, { requestId });
  }
}
