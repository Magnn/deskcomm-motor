/**
 * PUT /api/v1/settings/metas — grava a meta de receita da organização (manager+) em
 * `organizations.settings.metas`. `null` desliga. Merge NÃO destrutivo do jsonb, como `settings/painel`.
 * A régua e a cascata moram em `lib/venda/meta-de-receita.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { metasSchema } from "@/lib/venda/meta-de-receita";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({ metas: metasSchema.nullable() }).strict();

export async function PUT(req: NextRequest): Promise<Response> {
  const negado = await requireSupportWrite();
  if (negado) return negado;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "dashboard_settings" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });
  const settings = { ...(((atual as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>) };
  if (parsed.data.metas === null) delete settings.metas;
  else settings.metas = parsed.data.metas;

  const { error } = await admin.from("organizations").update({ settings }).eq("id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "org.revenue_goal_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { metas: parsed.data.metas },
  });
  return ok({ metas: parsed.data.metas }, { requestId });
}
