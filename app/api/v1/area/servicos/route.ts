/**
 * GET  /api/v1/area/servicos (viewer+)  — a vitrine da área do cliente.
 * POST /api/v1/area/servicos (manager+) — cadastra um serviço.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { COLUNAS_DO_SERVICO, servicoDaAreaSchema } from "@/lib/area-do-cliente/servicos";
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
    .from("area_servicos")
    .select(COLUNAS_DO_SERVICO)
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

  const lido = servicoDaAreaSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", lido.error.issues[0]?.message ?? "Serviço inválido.", 422, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("area_servicos")
    .insert({ ...lido.data, organization_id: authz.org.orgId })
    .select(COLUNAS_DO_SERVICO)
    .single();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "area.servico_criado",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_servico",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { preco_cents: lido.data.preco_cents, ativo: lido.data.ativo },
  });
  return ok(data, { requestId, status: 201 });
}
