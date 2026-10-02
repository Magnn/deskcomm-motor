/**
 * /api/v1/lancamentos — lançamentos em grupos de WhatsApp.
 *
 *   GET  → os lançamentos da empresa (com grupos, participantes e cliques) e os
 *          números que fazem grupo.
 *   POST → cria o lançamento JÁ com o primeiro grupo. Se o WhatsApp recusar o
 *          grupo, nada fica criado e o motivo volta na resposta.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { listarNumerosParaGrupos } from "@/lib/channels/numeros-para-grupos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { linkPublicoDoLancamento, resumirLancamentos } from "@/lib/lancamentos/consultas";
import { criarLancamentoSchema } from "@/lib/lancamentos/schemas";
import { criarLancamento, LancamentoError } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient } from "@/lib/waha/client";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("viewer", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  try {
    const admin = createAdminClient();
    const [lancamentos, numeros] = await Promise.all([
      resumirLancamentos(admin, auth.org.orgId),
      listarNumerosParaGrupos(admin, auth.org.orgId),
    ]);
    return ok({ lancamentos, numeros }, { requestId });
  } catch (err) {
    logger.error("[lancamentos] listagem falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível carregar os lançamentos."), 500, { requestId });
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "lancamentos" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const parsed = criarLancamentoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Confira os dados do lançamento."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const waha = getWahaClient();
  if (!waha) return fail("waha_not_configured", t("O WhatsApp por QR code não está configurado nesta instalação."), 503, { requestId });

  try {
    const { lancamento, grupo } = await criarLancamento(createAdminClient(), waha, {
      organizationId: auth.org.orgId,
      userId: auth.user.id,
      input: parsed.data,
    });
    void audit({
      action: "lancamento.criado",
      actorUserId: auth.user.id,
      organizationId: auth.org.orgId,
      resourceType: "group_launch",
      resourceId: lancamento.id,
      requestId,
      metadata: { nome: lancamento.name, numero: lancamento.channel_session_id, primeiro_grupo: grupo.id },
    });
    return ok({ id: lancamento.id, link: linkPublicoDoLancamento(lancamento.slug) }, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof LancamentoError) {
      return fail(err.code, t(err.message), err.code === "grupo_nao_criado" ? 502 : 422, { requestId });
    }
    logger.error("[lancamentos] criação falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível criar o lançamento."), 500, { requestId });
  }
}
