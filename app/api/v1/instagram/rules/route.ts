/** POST /api/v1/instagram/rules (manager+) — cria uma regra de "comentou, recebe direct". */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { criarRegraSchema } from "@/lib/channels/instagram/schemas";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const parsed = criarRegraSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira a regra: ela precisa de nome, mensagem do direct e, se for por palavra, de ao menos uma palavra."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const admin = createAdminClient();
  // A conta tem de ser DESTA organização: o id vem do corpo, e sem conferir uma
  // regra poderia ser pendurada na conta de outra empresa.
  const { data: conexao, error: erroDaConexao } = await admin
    .from("instagram_connections")
    .select("id")
    .eq("organization_id", auth.org.orgId)
    .eq("id", parsed.data.connection_id)
    .maybeSingle();
  if (erroDaConexao) return fail("internal_error", t("Não foi possível salvar a regra."), 500, { requestId });
  if (!conexao) return fail("validation_failed", t("Conta do Instagram não encontrada."), 422, { requestId });

  const { data, error } = await admin
    .from("instagram_comment_rules")
    .insert({ ...parsed.data, organization_id: auth.org.orgId, created_by: auth.user.id })
    .select("id")
    .single();
  if (error) {
    logger.error("[instagram] criação da regra falhou", { requestId, erro: error.message });
    return fail("internal_error", t("Não foi possível salvar a regra."), 500, { requestId });
  }

  void audit({
    action: "instagram.regra_criada",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "instagram_comment_rule",
    resourceId: (data as { id: string }).id,
    requestId,
    metadata: { nome: parsed.data.name, escopo: parsed.data.post_scope, casamento: parsed.data.match_type },
  });
  return ok(data, { requestId, status: 201 });
}
