/**
 * /api/v1/lancamentos/[id]/grupos
 *
 *   POST  → abre o próximo grupo agora (o link e a rodada do relógio já abrem
 *           sozinhos quando as vagas acabam; este é o botão de quem quer adiantar).
 *   PATCH → `{ group_id, status }`: fecha um grupo (sai do link e dos disparos) ou
 *           o reabre. A lotação continua sendo decidida pela contagem.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { abrirProximoGrupo, LancamentoError, lerLancamento } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient } from "@/lib/waha/client";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.strictObject({ group_id: z.string().uuid(), status: z.enum(["open", "closed"]) });

export async function POST(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });

  const waha = getWahaClient();
  if (!waha) return fail("waha_not_configured", t("O WhatsApp por QR code não está configurado nesta instalação."), 503, { requestId });

  const admin = createAdminClient();
  try {
    const lancamento = await lerLancamento(admin, auth.org.orgId, id);
    if (!lancamento || lancamento.status === "archived") return fail("not_found", t("Lançamento não encontrado."), 404, { requestId });
    const grupo = await abrirProximoGrupo(admin, waha, lancamento);
    if (grupo === null) return fail("state_conflict", t("Um grupo já está sendo aberto. Aguarde alguns segundos."), 409, { requestId });
    void audit({
      action: "lancamento.grupo_aberto",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "group_launch",
      resourceId: id,
      requestId,
      metadata: { grupo: grupo.id, posicao: grupo.position },
    });
    return ok(grupo, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof LancamentoError) {
      return fail(err.code, t(err.message), err.code === "grupo_nao_criado" ? 502 : 422, { requestId });
    }
    logger.error("[lancamentos] abertura de grupo falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível abrir o grupo."), 500, { requestId });
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

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Confira os dados do grupo."), 422, { requestId });

  const { data, error } = await createAdminClient()
    .from("group_launch_groups")
    .update({ status: parsed.data.status })
    .eq("organization_id", auth.org.orgId)
    .eq("launch_id", id)
    .eq("id", parsed.data.group_id)
    .select("id, status")
    .maybeSingle();
  if (error) {
    logger.error("[lancamentos] mudança de grupo falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível salvar o grupo."), 500, { requestId });
  }
  if (!data) return fail("not_found", t("Grupo não encontrado."), 404, { requestId });

  void audit({
    action: "lancamento.grupo_alterado",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "group_launch",
    resourceId: id,
    requestId,
    metadata: { grupo: parsed.data.group_id, status: parsed.data.status },
  });
  return ok(data, { requestId });
}
