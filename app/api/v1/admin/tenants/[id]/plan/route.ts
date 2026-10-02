/**
 * /api/v1/admin/tenants/[id]/plan — o plano de uma empresa, pelo dono da instalação.
 *
 *   GET → o catálogo em vigor, se a cobrança está ligada, e a assinatura da empresa.
 *   PUT → `{ plan_id }` põe a empresa no plano, em dia, com origem MANUAL (cortesia,
 *         conta própria, acerto por fora): não cai por aviso de pagamento.
 *         `{ plan_id: null }` remove a assinatura — a empresa volta a não poder
 *         conectar número.
 *
 * Só administrador da plataforma. O cliente nunca alcança esta rota, e a tabela da
 * assinatura não tem policy nenhuma: ele não pode se dar um plano.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import {
  ativarPlano,
  lerAssinatura,
  planosAtivos,
  planosDaInstalacao,
  removerPlano,
} from "@/lib/planos/assinatura-da-organizacao";
import { planoPorId } from "@/lib/planos/catalogo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ plan_id: z.string().trim().min(1).max(40).nullable() }).strict();

type Ctx = { params: Promise<{ id: string }> };

async function retrato(admin: ReturnType<typeof createAdminClient>, tenantId: string) {
  const assinatura = await lerAssinatura(admin, tenantId);
  return {
    cobrando: planosAtivos(),
    planos: planosDaInstalacao().map((p) => ({
      id: p.id,
      nome: p.nome,
      preco_mensal_centavos: p.precoMensalCentavos,
      numeros: p.numeros,
    })),
    assinatura: assinatura
      ? {
          plano_id: assinatura.planoId,
          status: assinatura.status,
          origem: assinatura.origem,
          referencia: assinatura.referencia,
          motivo: assinatura.motivo,
          atualizada_em: assinatura.atualizadaEm,
        }
      : null,
  };
}

export async function GET(_req: NextRequest, { params }: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const { id: tenantId } = await params;
  try {
    await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (!z.string().uuid().safeParse(tenantId).success) return fail("not_found", "Tenant not found", 404, { requestId });
  try {
    return ok(await retrato(createAdminClient(), tenantId), { requestId });
  } catch (err) {
    logger.error("[admin.tenants.plan] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "Não foi possível ler o plano.", 500, { requestId });
  }
}

export async function PUT(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { id: tenantId } = await params;
  const supportDenied = await requireSupportWrite(tenantId);
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (!z.string().uuid().safeParse(tenantId).success) return fail("not_found", "Tenant not found", 404, { requestId });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Invalid request body", 400, { requestId });
  const planoId = parsed.data.plan_id;

  if (planoId !== null && planoPorId(planosDaInstalacao(), planoId) === null) {
    return fail("validation_failed", "Esse plano não existe no catálogo desta instalação.", 422, { requestId });
  }

  const admin = createAdminClient();
  const { data: org, error: orgError } = await admin.from("organizations").select("id, slug").eq("id", tenantId).maybeSingle();
  if (orgError || !org) return fail("not_found", "Tenant not found", 404, { requestId });

  try {
    if (planoId === null) await removerPlano(admin, tenantId);
    else await ativarPlano(admin, { organizationId: tenantId, planoId, origem: "manual", por: adminCtx.user.id });
  } catch (err) {
    logger.error("[admin.tenants.plan] gravação falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "Não foi possível gravar o plano.", 500, { requestId });
  }

  void audit({
    action: "tenant.plano_definido",
    actorUserId: adminCtx.user.id,
    actingAsPlatformAdmin: true,
    bypassedRls: true,
    organizationId: tenantId,
    resourceType: "organization",
    resourceId: tenantId,
    requestId,
    metadata: { tenant_slug: org.slug, plano: planoId },
  });

  return ok(await retrato(admin, tenantId), { requestId });
}
