import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/ai/agents/:id/numeros (manager+) — os números que o agente atende além do principal.
 * PUT /api/v1/ai/agents/:id/numeros (admin)    — regrava a lista (`ai_agent_numeros`, migration 0962).
 *
 * Vale no PRÓXIMO turno, sem publicar versão: é onde o agente atende, não o que ele diz. O principal
 * continua sendo o número da versão publicada; a configuração do agente é uma só para todos.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corpoSchema = z.object({ channel_session_ids: z.array(z.string().uuid()).max(50) });

type Ctx = { params: Promise<{ id: string }> };

async function lerNumeros(admin: ReturnType<typeof createAdminClient>, orgId: string, agentId: string): Promise<string[] | null> {
  const { data, error } = await admin
    .from("ai_agent_numeros")
    .select("channel_session_id")
    .eq("organization_id", orgId)
    .eq("agent_id", agentId);
  if (error) return null;
  return (data ?? []).map((l) => l.channel_session_id);
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) return fail("invalid_request", "id inválido.", 400, { requestId });

  const authz = await requireRole("manager", { requestId, resource: "ai_agents" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id")
    .eq("id", id)
    .eq("organization_id", authz.org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });

  const numeros = await lerNumeros(admin, authz.org.orgId, id);
  if (numeros === null) return fail("internal_error", "Erro ao ler os números.", 500, { requestId });
  return ok({ channel_session_ids: numeros }, { requestId });
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
  const parsed = corpoSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const desejados = [...new Set(parsed.data.channel_session_ids)];

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, archived_at")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", "Agent arquivado.", 409, { requestId });

  // Todo número é conferido contra a ORGANIZAÇÃO antes de gravar: a FK composta recusaria, mas com erro genérico.
  if (desejados.length > 0) {
    const { data: validos, error } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", org.orgId)
      .in("id", desejados);
    if (error) return fail("internal_error", "Erro ao conferir os números.", 500, { requestId });
    const ids = new Set((validos ?? []).map((v) => v.id));
    const recusados = desejados.filter((d) => !ids.has(d));
    if (recusados.length > 0) {
      return fail("validation_failed", t("Número que não é desta empresa."), 422, { requestId, details: { recusados } });
    }
  }

  const anteriores = await lerNumeros(admin, org.orgId, id);
  if (anteriores === null) return fail("internal_error", "Erro ao ler os números.", 500, { requestId });
  const remover = anteriores.filter((n) => !desejados.includes(n));
  const inserir = desejados.filter((n) => !anteriores.includes(n));

  if (remover.length > 0) {
    const { error } = await admin
      .from("ai_agent_numeros")
      .delete()
      .eq("organization_id", org.orgId)
      .eq("agent_id", id)
      .in("channel_session_id", remover);
    if (error) return fail("internal_error", "Erro ao salvar os números.", 500, { requestId });
  }
  if (inserir.length > 0) {
    const { error } = await admin.from("ai_agent_numeros").insert(
      inserir.map((channel_session_id) => ({ organization_id: org.orgId, agent_id: id, channel_session_id, created_by: user.id })),
    );
    if (error) return fail("internal_error", "Erro ao salvar os números.", 500, { requestId });
  }

  if (remover.length > 0 || inserir.length > 0) {
    await audit({
      action: "ai.agent_numeros_updated",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "ai_agent",
      resourceId: id,
      requestId,
      metadata: { adicionados: inserir, removidos: remover },
    });
  }

  return ok({ channel_session_ids: desejados }, { requestId });
}
