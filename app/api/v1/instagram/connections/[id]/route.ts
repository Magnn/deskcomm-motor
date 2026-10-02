/**
 * /api/v1/instagram/connections/[id]
 *
 *   GET    → as publicações recentes da conta, para a regra escolher em quais vale.
 *   DELETE → desconecta a conta: desliga os avisos dela na Meta e apaga a conexão
 *            (as regras e o registro dela vão junto).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { cancelarAvisos, InstagramApiError, listarPublicacoes } from "@/lib/channels/instagram/api";
import { removerConexao, tokenDaConexao } from "@/lib/channels/instagram/repositorio";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Conta não encontrada."), 404, { requestId });

  try {
    const token = await tokenDaConexao(createAdminClient(), auth.org.orgId, id);
    if (!token) return fail("not_found", t("Conta não encontrada."), 404, { requestId });
    return ok({ publicacoes: await listarPublicacoes(token) }, { requestId });
  } catch (err) {
    if (err instanceof InstagramApiError) {
      return fail("instagram_recusou", t("O Instagram não devolveu as publicações. Reconecte a conta e tente de novo."), 502, {
        requestId,
        details: { motivo: err.detalhe },
      });
    }
    logger.error("[instagram] leitura das publicações falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar as publicações."), 500, { requestId });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return fail("not_found", t("Conta não encontrada."), 404, { requestId });

  const admin = createAdminClient();
  try {
    // Desligar os avisos é cortesia com a Meta; se falhar (token vencido, por
    // exemplo), a conexão sai do mesmo jeito — sem ela nenhum aviso é atendido.
    const token = await tokenDaConexao(admin, auth.org.orgId, id);
    if (token) await cancelarAvisos(token).catch((err) => logger.warn("[instagram] avisos não foram desligados na Meta", { requestId, erro: String(err) }));

    if (!(await removerConexao(admin, auth.org.orgId, id))) return fail("not_found", t("Conta não encontrada."), 404, { requestId });
    void audit({
      action: "instagram.conta_desconectada",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "instagram_connection",
      resourceId: id,
      requestId,
    });
    return ok({ id }, { requestId });
  } catch (err) {
    logger.error("[instagram] desconexão falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível desconectar a conta."), 500, { requestId });
  }
}
