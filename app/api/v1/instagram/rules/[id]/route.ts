/**
 * /api/v1/instagram/rules/[id] (manager+)
 *
 *   PATCH  → regrava a regra inteira (a conta dela não muda).
 *   DELETE → apaga a regra. O registro dos comentários que ela atendeu fica.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { atualizarRegraSchema } from "@/lib/channels/instagram/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Regra não encontrada."), 404, { requestId });

  const parsed = atualizarRegraSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira a regra: ela precisa de nome, mensagem do direct e, se for por palavra, de ao menos uma palavra."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const { data, error } = await createAdminClient()
    .from("instagram_comment_rules")
    .update(parsed.data)
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    logger.error("[instagram] atualização da regra falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível salvar a regra."), 500, { requestId });
  }
  if (!data) return fail("not_found", t("Regra não encontrada."), 404, { requestId });

  void audit({
    action: "instagram.regra_atualizada",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "instagram_comment_rule",
    resourceId: id,
    requestId,
    metadata: { ativa: parsed.data.is_active },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Regra não encontrada."), 404, { requestId });

  const { data, error } = await createAdminClient()
    .from("instagram_comment_rules")
    .delete()
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .select("id");
  if (error) {
    logger.error("[instagram] remoção da regra falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível apagar a regra."), 500, { requestId });
  }
  if ((data?.length ?? 0) === 0) return fail("not_found", t("Regra não encontrada."), 404, { requestId });

  void audit({
    action: "instagram.regra_removida",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "instagram_comment_rule",
    resourceId: id,
    requestId,
  });
  return ok({ id }, { requestId });
}
