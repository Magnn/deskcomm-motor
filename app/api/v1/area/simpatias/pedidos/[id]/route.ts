/**
 * PATCH /api/v1/area/simpatias/pedidos/:id (agent+) — "feita": marca o pedido pago como feito, com um recado
 * opcional para a pessoa. A área dela passa a mostrar a data e o recado. Só um pedido PAGO e ainda não feito
 * pode ser marcado (o banco também recusa feito sem pago).
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corpo = z.strictObject({ nota: z.string().trim().max(500).optional() });
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const { id } = await params;
  if (!UUID.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });
  const authz = await requireRole("agent", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const lido = corpo.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) return fail("validation_failed", "O recado tem até 500 caracteres.", 422, { requestId });

  // A tabela é só do servidor (a RLS não dá escrita à equipe); o papel já foi decidido acima e a organização
  // vem da sessão, nunca do corpo.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("area_simpatias_pedidos")
    .update({ feita_at: new Date().toISOString(), feita_por_user_id: authz.user.id, nota: lido.data.nota || null })
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .not("pago_at", "is", null)
    .is("feita_at", null)
    .select("id, contact_id, titulo, feita_at, nota")
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  if (!data) return fail("state_conflict", "Este pedido não está pago ou já foi marcado como feito.", 409, { requestId });
  const feito = data as { id: string; contact_id: string; titulo: string; feita_at: string; nota: string | null };

  await registrarEvento(admin, {
    organizationId: authz.org.orgId,
    contactId: feito.contact_id,
    tipo: "simpatia_feita",
    props: { titulo: feito.titulo, com_recado: Boolean(feito.nota) },
  });
  await audit({
    action: "area.simpatia_feita",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "area_simpatia_pedido",
    resourceId: id,
    requestId,
    metadata: { com_recado: Boolean(feito.nota) },
  });
  return ok(feito, { requestId });
}
