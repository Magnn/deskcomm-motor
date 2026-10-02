/**
 * POST /api/v1/tenants/subscription — o pagamento liga e desliga o acesso.
 *
 * Quem chama é a automação de pagamento do DONO DA INSTALAÇÃO (o webhook da
 * plataforma, direto ou por um orquestrador):
 *
 *   status: "active"    → a empresa do cliente existe e está liberada. No primeiro
 *                         pagamento ela é criada e a resposta traz um link de uso
 *                         único para o dono definir a senha.
 *   status: "suspended" → a empresa é suspensa e os fluxos em andamento param.
 *
 * As duas são idempotentes: a plataforma pode reentregar o mesmo aviso.
 *
 * A guarda é a MESMA de `/api/v1/tenants/provision`: o segredo da instalação
 * (`TENANT_PROVISIONING_SECRET`), limite por IP contando FALHAS, e 404 para
 * quem não ligou a porta. Ver o cabeçalho daquela rota para o porquê de cada uma.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit, peekRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { EmailJaTemContaError, ProvisionConflictError } from "@/lib/auth/provision";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { extractBearer } from "@/lib/mcp/auth";
import { validateRequest } from "@/lib/schemas/_validate";
import { tenantSubscriptionSchema, type TenantSubscriptionInput } from "@/lib/schemas/tenant-subscription";
import { ativarAssinatura, suspenderAssinatura } from "@/lib/tenants/assinatura";

export const dynamic = "force-dynamic";

const TAMANHO_MINIMO_DO_SEGREDO = 32;
const FALHAS_POR_MINUTO = 10;

function segredoDaInstalacao(): string | null {
  const segredo = env.TENANT_PROVISIONING_SECRET.trim();
  return segredo.length >= TAMANHO_MINIMO_DO_SEGREDO ? segredo : null;
}

function bearerConfere(req: NextRequest, esperado: string): boolean {
  const recebido = extractBearer(req.headers.get("authorization")) ?? "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const esperado = segredoDaInstalacao();
  if (!esperado) return fail("not_found", "Not found.", 404, { requestId });

  const ip = ipDoCliente(req.headers);
  const balde = ip === null ? null : `tenants_subscription:falha:ip:${ip}`;
  const falhas = balde === null ? 0 : await peekRateLimit(balde, 60);
  if (balde !== null && falhas >= FALHAS_POR_MINUTO) {
    return fail("rate_limited", "Too many requests.", 429, { requestId, headers: { "Retry-After": "60" } });
  }

  if (!bearerConfere(req, esperado)) {
    if (balde !== null) await checkRateLimit(balde, FALHAS_POR_MINUTO, 60);
    return fail("unauthenticated", "Credencial inválida.", 401, { requestId });
  }

  let input: TenantSubscriptionInput;
  try {
    input = await validateRequest(tenantSubscriptionSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const dados = {
    integration: input.integration,
    externalId: input.external_id,
    organizationName: input.organization_name,
    ownerEmail: input.owner_email,
    ownerName: input.owner_name,
    reason: input.reason,
    requestId,
  };

  try {
    const r = input.status === "active" ? await ativarAssinatura(dados) : await suspenderAssinatura(dados);

    if (!r.ok) {
      return r.motivo === "empresa_nao_encontrada"
        ? fail("not_found", "Nenhuma empresa desta instalação nasceu desta assinatura.", 404, { requestId })
        : fail(
            "validation_failed",
            "Primeiro pagamento: informe organization_name, owner_email e owner_name para criar a empresa.",
            422,
            { requestId },
          );
    }

    return ok(
      {
        organization_id: r.organizationId,
        status: r.status,
        created: r.criada,
        access_link: r.linkDeAcesso,
        flows_stopped: r.fluxosEncerrados,
      },
      {
        status: r.criada ? 201 : 200,
        requestId,
        // O link de acesso é de uso único: nenhum cache guarda.
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    if (err instanceof EmailJaTemContaError) {
      return fail(
        "owner_email_ja_tem_conta",
        "Esse e-mail já tem conta nesta instalação — convide a pessoa pela tela da empresa.",
        409,
        { requestId },
      );
    }
    if (err instanceof ProvisionConflictError) {
      return fail(
        "provisioning_conflict",
        "Já existe uma organização com este identificador que não nasceu deste provisionamento.",
        409,
        { requestId },
      );
    }
    logger.error("[tenants.subscription] falhou", {
      requestId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Não foi possível aplicar a assinatura.", 500, { requestId });
  }
}
