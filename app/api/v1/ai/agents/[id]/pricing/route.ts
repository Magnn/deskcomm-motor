import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/ai/agents/:id/pricing (manager+) — o preço e a negociação do agente.
 * PUT /api/v1/ai/agents/:id/pricing (admin)    — grava (`ai_agents.config.pricing`) e liga o
 *   PISO na trava de promessas da organização.
 *
 * Dinheiro é decisão de admin: quem edita o cadastro do agente não muda por aqui o valor que a
 * agente cobra nem o mínimo que ela aceita. A ordem no PUT é deliberada — a trava primeiro, a
 * configuração depois: se a trava não subiu, a configuração NÃO é salva (negociar sem o piso
 * garantido é pior que não negociar).
 *
 * A trava é da ORGANIZAÇÃO, não do agente: o piso vale para todos os agentes dela.
 * Desligar (`enabled: false`) pára a agente de negociar, mas não remove a trava — tirar uma
 * proteção de preço não é efeito colateral de desligar um recurso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { lerCatalogo, menorPrecoDoCatalogo } from "@/lib/catalogo/tipos";
import { traduzir } from "@/lib/i18n/dicionario";
import { sincronizarPiso } from "@/lib/preco/sincronizar-piso";
import { pisoEmCentavos, pricingSchema } from "@/lib/preco/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const { data: agente } = await createAdminClient()
    .from("ai_agents")
    .select("id, config")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });

  const bruto = (agente.config as { pricing?: unknown } | null)?.pricing ?? null;
  const lido = pricingSchema.safeParse(bruto);
  return ok(
    { pricing: lido.success ? lido.data : null, floor_cents: lido.success ? pisoEmCentavos(lido.data) : null },
    { requestId },
  );
}

export async function PUT(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("admin", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = pricingSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const pricing = parsed.data;

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, config, archived_at")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", "Agent arquivado.", 409, { requestId });

  const piso = pisoEmCentavos(pricing);
  if (pricing.enabled) {
    try {
      // O catálogo do agente também tem valores que a agente diz: o mais barato entra no piso.
      await sincronizarPiso(admin, org.orgId, pricing, menorPrecoDoCatalogo(lerCatalogo(agente.config)));
    } catch {
      return fail(
        "guardrail_sync_failed",
        t("Não consegui ligar a trava do valor mínimo. Nada foi salvo — tente de novo."),
        500,
        { requestId },
      );
    }
  }

  const atual = (agente.config ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("ai_agents")
    .update({ config: { ...atual, pricing }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId);
  if (error) return fail("internal_error", "Erro ao salvar o preço.", 500, { requestId });

  await audit({
    action: "ai.pricing_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    metadata: {
      enabled: pricing.enabled,
      list_price_cents: pricing.list_price_cents,
      anchor_price_cents: pricing.anchor_price_cents ?? null,
      anchor_declared_real: pricing.anchor_is_real === true,
      floor_cents: piso,
      steps: pricing.steps.length,
    },
  });

  return ok({ pricing, floor_cents: piso }, { requestId });
}
