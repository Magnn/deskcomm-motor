/**
 * GET   /api/v1/settings/painel — o agente padrão do painel da organização.
 * PATCH /api/v1/settings/painel — grava (manager+).
 *
 * O painel abre recortado nesse agente (`lib/resultado/vendas-do-agente.ts`). Merge NÃO destrutivo do jsonb
 * `organizations.settings`, como `settings/campanhas`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { agentePadraoDoPainel } from "@/lib/resultado/vendas-do-agente";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** `null` = o painel abre na organização inteira. */
const corpoSchema = z.object({ agente_id: z.string().uuid().nullable() });

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "dashboard_settings" });
  if (!authz.ok) return authz.response;

  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });
  return ok({ agente_id: agentePadraoDoPainel((data as { settings?: unknown } | null)?.settings) }, { requestId });
}

export async function PATCH(req: NextRequest): Promise<Response> {
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
  const { agente_id } = parsed.data;

  const admin = createAdminClient();
  if (agente_id) {
    const { data: agente, error: erroAgente } = await admin
      .from("ai_agents")
      .select("id")
      .eq("organization_id", authz.org.orgId)
      .eq("id", agente_id)
      .is("archived_at", null)
      .maybeSingle();
    if (erroAgente) return fail("internal_error", erroAgente.message, 500, { requestId });
    if (!agente) return fail("validation_failed", t("Agente não encontrado."), 422, { requestId });
  }

  const { data: atual, error: erroLeitura } = await admin
    .from("organizations")
    .select("settings")
    .eq("id", authz.org.orgId)
    .maybeSingle();
  if (erroLeitura) return fail("internal_error", erroLeitura.message, 500, { requestId });

  const settings = ((atual as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const painel = (settings.painel ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("organizations")
    .update({ settings: { ...settings, painel: { ...painel, agente_id } } })
    .eq("id", authz.org.orgId);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  void audit({
    action: "org.dashboard_agent_updated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "organization",
    resourceId: authz.org.orgId,
    requestId,
    metadata: { agente_id, anterior: agentePadraoDoPainel(settings) },
  });

  return ok({ agente_id }, { requestId });
}
