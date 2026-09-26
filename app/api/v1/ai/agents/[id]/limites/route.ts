import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET /api/v1/ai/agents/:id/limites (manager+) — os limites do agente: o que ele nunca diz e os assuntos que não discute.
 * PUT /api/v1/ai/agents/:id/limites (admin)    — grava (`ai_agents.config.limits`).
 *
 * Vale no PRÓXIMO turno, sem publicar versão (o mesmo desenho das abas Preço, Identidade, Oferta e Objeções), e por isso é
 * decisão de admin: quem edita o cadastro do agente não muda por aqui o que ele está proibido de dizer,
 * nem o que ele está proibido de dizer. A rota genérica de PATCH do agente não escreve esta chave (o schema dela
 * descarta chave desconhecida), então este é o único caminho e o único que valida.
 *
 * A configuração é escrita por MERGE sobre `config`: as outras chaves (`pricing`, `identity`,
 * `offer`, `objections`, `voice_reply`, janelas) ficam como estavam. O PREÇO não passa por aqui — tem aba e rota próprias.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { limitesSchema } from "@/lib/limites/tipos";
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
  const bruto = (agente.config as { limits?: unknown } | null)?.limits ?? null;
  const lido = limitesSchema.safeParse(bruto);
  return ok({ limits: lido.success ? lido.data : null }, { requestId });
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
  const parsed = limitesSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const limits = parsed.data;

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
    .update({ config: { ...atual, limits }, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId);
  if (error) return fail("internal_error", "Erro ao salvar os limites.", 500, { requestId });

  await audit({
    action: "ai.limits_updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    // Só o formato: quantos itens em cada lista. Nenhum texto que o dono digitou vai para a auditoria.
    metadata: { enabled: limits.enabled, nunca_diz: limits.nunca_diz.length, evita_assuntos: limits.evita_assuntos.length },
  });

  return ok({ limits }, { requestId });
}
