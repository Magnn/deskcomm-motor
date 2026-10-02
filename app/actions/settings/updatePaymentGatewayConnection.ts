"use server";

import { supportWriteError } from "@/lib/impersonate/support";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { criarClienteAsaas, ErroDeCobranca } from "@/lib/pagamentos/asaas";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

/**
 * Conectar a conta de cobrança (Asaas) — pela tela.
 *
 * Admin da ORGANIZAÇÃO: a chave emite cobranças em nome da empresa, ao lado de billing e API tokens. Mesmas
 * regras da conexão de anúncios (`updateAdPlatformConnection`): a chave NUNCA vai em claro (sem cifra, o save
 * recusa), o campo vazio mantém a chave gravada (nunca apaga), e `upsert` — um `update` numa linha que não
 * existe devolveria sucesso sem gravar nada.
 *
 * A chave é CONFERIDA no provedor antes de gravar: uma chave errada descoberta aqui é uma mensagem; descoberta
 * na hora da cobrança é um cliente que não recebeu o link.
 */
export type UpdatePaymentGatewayConnectionResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_failed"
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "cifra_indisponivel"
        | "chave_recusada"
        | "provedor_indisponivel"
        | "erro_ao_gravar";
      details?: unknown;
    };

const entradaSchema = z.object({
  provider: z.literal("asaas"),
  /** Opcional: vazio = "mantenha a gravada". Trocar só o ambiente ou o interruptor não exige redigitar. */
  api_key: z.string().trim().min(20).max(400).optional(),
  environment: z.enum(["production", "sandbox"]),
  enabled: z.boolean(),
});

export type PaymentGatewayConnectionInput = z.infer<typeof entradaSchema>;

export async function updatePaymentGatewayConnection(
  input: PaymentGatewayConnectionInput,
): Promise<UpdatePaymentGatewayConnectionResult> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed", details: parsed.error.flatten() };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const valores: Record<string, unknown> = {
    organization_id: activeOrg.orgId,
    provider: parsed.data.provider,
    environment: parsed.data.environment,
    enabled: parsed.data.enabled,
    updated_by: authUser.id,
  };

  if (parsed.data.api_key) {
    try {
      await criarClienteAsaas({ apiKey: parsed.data.api_key, ambiente: parsed.data.environment }).validarChave();
    } catch (e) {
      if (e instanceof ErroDeCobranca && e.codigo === "chave_invalida") return { ok: false, error: "chave_recusada" };
      return { ok: false, error: "provedor_indisponivel" };
    }
    const cifrado = await encryptWebhookSecret(admin, parsed.data.api_key);
    if (!cifrado) return { ok: false, error: "cifra_indisponivel" };
    valores.api_key_encrypted = cifrado;
  }

  const { error } = await admin
    .from("payment_gateway_connections")
    .upsert(valores, { onConflict: "organization_id,provider" });
  if (error) return { ok: false, error: "erro_ao_gravar", details: error.message };

  const hdrs = await headers();
  await audit({
    action: "payment_gateway_connection.updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "payment_gateway_connections",
    resourceId: null,
    requestId: hdrs.get("x-request-id") ?? undefined,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: hdrs.get("user-agent") ?? undefined,
    metadata: {
      provider: parsed.data.provider,
      environment: parsed.data.environment,
      enabled: parsed.data.enabled,
      // Só o fato; a chave, nunca.
      api_key_changed: Boolean(parsed.data.api_key),
    },
  });

  revalidatePath("/app/settings/pagamentos");
  return { ok: true };
}
