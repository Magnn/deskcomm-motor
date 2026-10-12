"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { ErroDaStripe, criarClienteStripe } from "@/lib/pagamentos/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

/**
 * Conectar a Stripe para o Pix na conversa — pela tela, com UM campo.
 *
 * A pessoa cola a chave e mais nada: a chave é conferida na Stripe, a tela diz se o Pix está ativo naquela
 * conta, e o endereço que recebe o aviso de pagamento é registrado na Stripe POR NÓS (o segredo da assinatura
 * volta uma vez só e é guardado cifrado). Colar segredo de webhook à mão é a etapa em que todo mundo erra.
 *
 * Mesmas regras da conexão do Asaas (`updatePaymentGatewayConnection`): admin da organização, MFA em dia, chave
 * nunca em claro (sem cifra, recusa), campo vazio mantém a chave gravada.
 */
export type ConectarStripeResult =
  | { ok: true; pixAtivo: boolean; conta: string | null }
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
        | "endereco_sem_https"
        | "erro_ao_gravar";
    };

const entradaSchema = z.object({
  /** Opcional: vazio = "mantenha a gravada" (só liga ou desliga). */
  api_key: z.string().trim().min(20).max(400).regex(/^(sk|rk)_/, "a chave começa por sk_ ou rk_").optional(),
  enabled: z.boolean(),
});

export async function conectarStripe(input: z.infer<typeof entradaSchema>): Promise<ConectarStripeResult> {
  const parsed = entradaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const admin = createAdminClient();
  const hdrs = await headers();
  const valores: Record<string, unknown> = {
    organization_id: activeOrg.orgId,
    provider: "stripe",
    environment: "production",
    enabled: parsed.data.enabled,
    updated_by: authUser.id,
  };

  let pixAtivo = false;
  let conta: string | null = null;
  const chave = parsed.data.api_key;
  if (chave) {
    try {
      const lida = await criarClienteStripe({ chave }).lerConta();
      pixAtivo = lida.pixAtivo;
      conta = lida.nome ?? lida.id;
    } catch (e) {
      if (e instanceof ErroDaStripe && e.codigo === "chave_invalida") return { ok: false, error: "chave_recusada" };
      return { ok: false, error: "provedor_indisponivel" };
    }
    const cifrada = await encryptWebhookSecret(admin, chave);
    if (!cifrada) return { ok: false, error: "cifra_indisponivel" };
    valores.api_key_encrypted = cifrada;
  }

  const { data: gravada, error } = await admin
    .from("payment_gateway_connections")
    .upsert(valores, { onConflict: "organization_id,provider" })
    .select("id, webhook_secret_encrypted")
    .single();
  if (error || !gravada) return { ok: false, error: "erro_ao_gravar" };
  const linha = gravada as { id: string; webhook_secret_encrypted: string | null };

  // O aviso de pagamento é registrado quando a chave entra (ou troca) — a chave nova pode ser de outra conta.
  if (chave) {
    const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
    const protocolo = (hdrs.get("x-forwarded-proto") ?? "https").split(",")[0]?.trim() || "https";
    // A Stripe só entrega aviso de conta real em https; em localhost a conexão fica gravada e sem aviso.
    if (!host || protocolo !== "https") return { ok: false, error: "endereco_sem_https" };
    try {
      const aviso = await criarClienteStripe({ chave }).criarAvisoDePagamento(`https://${host}/api/v1/webhooks/stripe/${linha.id}`);
      const segredo = await encryptWebhookSecret(admin, aviso.segredo);
      if (!segredo) return { ok: false, error: "cifra_indisponivel" };
      const { error: erroDoSegredo } = await admin
        .from("payment_gateway_connections")
        .update({ webhook_secret_encrypted: segredo })
        .eq("organization_id", activeOrg.orgId)
        .eq("id", linha.id);
      if (erroDoSegredo) return { ok: false, error: "erro_ao_gravar" };
    } catch (e) {
      if (e instanceof ErroDaStripe && e.codigo === "chave_invalida") return { ok: false, error: "chave_recusada" };
      return { ok: false, error: "provedor_indisponivel" };
    }
  }

  await audit({
    action: "payment_gateway_connection.updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "payment_gateway_connections",
    resourceId: linha.id,
    requestId: hdrs.get("x-request-id") ?? undefined,
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    userAgent: hdrs.get("user-agent") ?? undefined,
    // Só o fato; a chave e o segredo, nunca.
    metadata: { provider: "stripe", enabled: parsed.data.enabled, api_key_changed: Boolean(chave), pix_ativo: pixAtivo },
  });

  revalidatePath("/app/settings/pagamentos");
  return { ok: true, pixAtivo, conta };
}
