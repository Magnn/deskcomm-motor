/**
 * GET /api/v1/ai/followup-flows/:id/numeros — os números da organização e QUEM
 * atende cada um, do ponto de vista deste fluxo.
 *
 * É a leitura que o painel do gatilho usa para mostrar (e deixar trocar) o
 * vínculo número ↔ fluxo. O dado mora no número (ver
 * `lib/channels/channel-flow-config.ts`); a escrita é o PATCH de
 * `/api/v1/channel-sessions/:id/flow`, o mesmo da tela de Conexões.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { listarNumerosDoFluxo } from "@/lib/channels/numeros-do-fluxo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("viewer", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;

  const admin = createAdminClient();
  const { data: fluxo, error: fluxoErr } = await admin
    .from("followup_flow_pointers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (fluxoErr) return fail("internal_error", fluxoErr.message, 500, { requestId });
  if (!fluxo) return fail("not_found", "Fluxo não encontrado.", 404, { requestId });

  const resultado = await listarNumerosDoFluxo(admin, orgId, id);
  if (!resultado.ok) return fail("internal_error", resultado.message, 500, { requestId });

  return ok(resultado.numeros, { requestId });
}
