import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/ai/agents/:id/consciencia (manager+) — a consciência do lead: nível (Schwartz),
 * desejo/dor, medo oculto e a promessa central da oferta.
 * PUT /api/v1/ai/agents/:id/consciencia (admin)    — grava (`ai_agents.config.consciencia`).
 *
 * Vale no PRÓXIMO turno, sem publicar versão (o mesmo desenho das abas Preço, Identidade, Oferta,
 * Objeções e Limites), e por isso é decisão de admin. A rota genérica de PATCH do agente não escreve
 * esta chave (o schema dela descarta chave desconhecida), então este é o único caminho e o único que valida.
 *
 * A configuração é escrita por MERGE sobre `config`: as outras chaves (`pricing`, `identity`, `offer`,
 * `objections`, `limits`, `voice_reply`, janelas) ficam como estavam.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { conscienciaSchema } from "@/lib/consciencia/tipos";
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

  // Aqui, ao contrário do que o turno lê, o `enabled: false` também volta: a tela precisa mostrar o que
  // o dono preencheu mesmo com o bloco desligado.
  const bruto = (agente.config as { consciencia?: unknown } | null)?.consciencia ?? null;
  const lido = conscienciaSchema.safeParse(bruto);
  return ok({ consciencia: lido.success ? lido.data : null }, { requestId });
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
  const parsed = conscienciaSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const consciencia = parsed.data;

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, config, archived_at")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", "Agent arquivado.", 409, { requestId });

  const atual = (agente.config ?? {}) as Record<string, unknown>;
  const { error } = await admin
    .from("ai_agents")
    .update({ config: { ...atual, consciencia }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId);
  if (error) return fail("internal_error", "Erro ao salvar a consciência do lead.", 500, { requestId });

  await audit({
    action: "ai.consciencia_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    // Só o formato: nunca o texto que o dono digitou (desejo/medo/promessa) vai para a auditoria.
    metadata: { enabled: consciencia.enabled, nivel: consciencia.nivel ?? null },
  });

  return ok({ consciencia }, { requestId });
}
