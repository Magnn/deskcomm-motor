import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/agents/:id/rascunho (admin) — rascunho por IA de uma aba estruturada.
 *
 * NÃO escreve em `ai_agents`: devolve campos soltos para o formulário da aba mostrar, e
 * é o botão "Salvar" de cada aba (PUT /identidade, PUT /limites) quem grava e valida de
 * verdade — os DOIS já rodam de novo o schema de origem, então um rascunho torto não
 * chega a ser persistido sem passar por lá. O teto de admin aqui é o mesmo de quem pode
 * salvar: gerar um rascunho que ninguém pode aproveitar não serviria a um papel menor.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { gerarRascunho, mensagemDoErroDeRascunho } from "@/lib/rascunho-ia/gerar";
import { rascunhoInputSchema } from "@/lib/rascunho-ia/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
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
  const parsed = rascunhoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const admin = createAdminClient();
  const { data: agente } = await admin
    .from("ai_agents")
    .select("id, archived_at")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (!agente) return fail("not_found", t("Agent não encontrado."), 404, { requestId });
  if (agente.archived_at) return fail("state_conflict", t("Agent arquivado."), 409, { requestId });

  const resultado = await gerarRascunho({
    admin,
    agentId: id,
    organizationId: org.orgId,
    campo: parsed.data.campo,
    contexto: parsed.data.contexto,
  });

  if (!resultado.ok) {
    const status = resultado.codigo === "geracao_falhou" ? 502 : 409;
    return fail(resultado.codigo, t(mensagemDoErroDeRascunho(resultado.codigo)), status, { requestId });
  }

  await audit({
    action: "ai.rascunho_gerado",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "ai_agent",
    resourceId: id,
    requestId,
    // Só o formato: campo e quantos campos vieram preenchidos. O texto do rascunho (que a
    // IA escreveu a partir da descrição do dono, e o próprio dono digitou como contexto)
    // não vai para a auditoria.
    metadata: { campo: parsed.data.campo, campos_preenchidos: Object.keys(resultado.dados).length },
  });

  return ok({ campo: parsed.data.campo, rascunho: resultado.dados }, { requestId });
}
