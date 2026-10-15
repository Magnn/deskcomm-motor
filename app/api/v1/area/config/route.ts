/**
 * GET /api/v1/area/config (viewer+) — a configuração da área do cliente e o
 *   endereço público dela.
 * PUT /api/v1/area/config (manager+) — liga/desliga e ajusta título, frase,
 *   WhatsApp do botão e cor. Grava em `organizations.settings.area`, sem tocar
 *   no resto de `settings`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { configDaAreaSchema, lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { caminhoDaArea } from "@/lib/area-do-cliente/vocabulario";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("slug, settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  const org = data as { slug: string; settings: unknown } | null;
  if (!org) return fail("not_found", "Organização não encontrada.", 404, { requestId });
  return ok(
    { config: lerConfigDaArea(org.settings), endereco: `${req.nextUrl.origin}${caminhoDaArea(org.slug)}` },
    { requestId },
  );
}

export async function PUT(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;

  const lido = configDaAreaSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) {
    return fail("validation_failed", lido.error.issues[0]?.message ?? "Configuração inválida.", 422, { requestId });
  }
  // Mescla no `settings` atual pelo cliente de serviço: a escrita em `organizations`
  // é de admin pela RLS, e a decisão de papel (manager+) já foi tomada acima.
  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  const settings = ((atual as { settings: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("organizations")
    .update({ settings: { ...settings, area: lido.data } })
    .eq("id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  await audit({
    action: "area.config_alterada",
    organizationId: authz.org.orgId,
    actorUserId: authz.user.id,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { ativo: lido.data.ativo, tem_whatsapp: Boolean(lido.data.whatsapp) },
  });
  return ok({ config: lido.data }, { requestId });
}
