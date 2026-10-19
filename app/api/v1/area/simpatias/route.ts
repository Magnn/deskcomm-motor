/**
 * GET  /api/v1/area/simpatias (viewer+)  — o catálogo de simpatias da área do cliente.
 * POST /api/v1/area/simpatias (manager+) — cadastra uma simpatia.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { COLUNAS_DA_SIMPATIA, simpatiaSchema } from "@/lib/area-do-cliente/simpatias";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_simpatias")
    .select(COLUNAS_DA_SIMPATIA)
    .eq("organization_id", authz.org.orgId)
    .order("posicao", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const lido = simpatiaSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", lido.error.issues[0]?.message ?? "Simpatia inválida.", 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_simpatias")
    .insert({ ...lido.data, organization_id: authz.org.orgId })
    .select(COLUNAS_DA_SIMPATIA)
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "area.simpatia_criada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_simpatia",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { publicada: lido.data.publicada },
  });
  return ok(data, { requestId, status: 201 });
}
