/**
 * /api/v1/lancamentos/[id]
 *
 *   GET   → o lançamento com os grupos, o link público, os cliques e os disparos.
 *   PATCH → nome, lotação, descrição dos próximos grupos, e o estado:
 *           `paused` segura o link e os disparos; `archived` encerra.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { detalharLancamento } from "@/lib/lancamentos/consultas";
import { atualizarLancamentoSchema } from "@/lib/lancamentos/schemas";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });
  try {
    const detalhe = await detalharLancamento(createAdminClient(), auth.org.orgId, id);
    if (!detalhe) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });
    return ok(detalhe, { requestId });
  } catch (err) {
    logger.error("[lancamentos] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar o lançamento."), 500, { requestId });
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  const parsed = atualizarLancamentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Confira os dados do lançamento."), 422, { requestId });

  const { data, error } = await createAdminClient()
    .from("group_launches")
    .update(parsed.data)
    .eq("organization_id", auth.org.orgId)
    .eq("id", id)
    .select("id, status")
    .maybeSingle();
  if (error) {
    logger.error("[lancamentos] atualização falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível salvar o lançamento."), 500, { requestId });
  }
  if (!data) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  void audit({
    action: "lancamento.atualizado",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "group_launch",
    resourceId: id,
    requestId,
    metadata: { campos: Object.keys(parsed.data), status: parsed.data.status ?? null },
  });
  return ok(data, { requestId });
}
