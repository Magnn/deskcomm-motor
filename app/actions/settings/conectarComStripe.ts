"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { loadAuthUser, mfaEmDivida, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { supportWriteError } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { ErroDaStripe, criarAvisoDaPlataforma } from "@/lib/pagamentos/stripe";
import { criarStripeConnect } from "@/lib/pagamentos/stripe-connect";
import { configuracaoDaStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

/**
 * "CONECTAR COM STRIPE" — o botão de Configurações › Pagamentos. Devolve o endereço do cadastro da Stripe para
 * a tela abrir; a pessoa preenche lá (dados da empresa, conta bancária) e volta para cá.
 *
 * Na primeira vez cria a conta da empresa sob a plataforma da instalação (`lib/pagamentos/stripe-connect.ts`).
 * Da segunda em diante só abre o cadastro de novo — é o caminho de quem parou no meio ou tem pendência.
 *
 * O aviso de pagamento das contas conectadas é UM endereço da plataforma. Ele é registrado na Stripe quando a
 * primeira empresa conecta, e o segredo (que a Stripe devolve uma vez só) é copiado para cada linha conectada.
 *
 * Mesmas guardas de `conectarStripe` (chave colada): admin da organização, MFA em dia, sessão de suporte não.
 */
export type ConectarComStripeResult =
  | { ok: true; url: string }
  | {
      ok: false;
      error:
        | "unauthenticated"
        | "forbidden_tenant"
        | "forbidden_role"
        | "mfa_required"
        | "plataforma_sem_stripe"
        | "connect_desligado"
        | "endereco_sem_https"
        | "cifra_indisponivel"
        | "provedor_indisponivel"
        | "erro_ao_gravar";
    };

const ENDERECO_DO_AVISO = "/api/v1/webhooks/stripe-connect";

export async function conectarComStripe(): Promise<ConectarComStripeResult> {
  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden_role" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin)
    return { ok: false, error: "forbidden_role" };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };

  const cfg = configuracaoDaStripeDosPlanos();
  if (!cfg) return { ok: false, error: "plataforma_sem_stripe" };

  const hdrs = await headers();
  // O webhook é da instalação inteira. Um Host fornecido por uma organização não pode redirecioná-lo.
  const enderecoDaInstalacao = new URL(env.NEXT_PUBLIC_APP_URL);
  if (enderecoDaInstalacao.protocol !== "https:") return { ok: false, error: "endereco_sem_https" };
  const base = enderecoDaInstalacao.origin;

  const admin = createAdminClient();
  const connect = criarStripeConnect(cfg);
  const orgId = activeOrg.orgId;

  // ⚠️ Filtro de organização: o client é service-role.
  const { data: atual, error: erroDeLeitura } = await admin
    .from("payment_gateway_connections")
    .select("id, enabled, stripe_account_id, stripe_connect_webhook_secret_encrypted")
    .eq("organization_id", orgId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (erroDeLeitura) return { ok: false, error: "erro_ao_gravar" };
  const linhaAtual = atual as {
    id: string;
    enabled: boolean;
    stripe_account_id: string | null;
    stripe_connect_webhook_secret_encrypted: string | null;
  } | null;

  try {
    let conta = linhaAtual?.stripe_account_id ?? null;
    const criadaAgora = conta === null;
    if (conta === null) {
      const { data: org } = await admin
        .from("organizations")
        .select("display_name")
        .eq("id", orgId)
        .maybeSingle();
      const criada = await connect.criarConta({
        organizationId: orgId,
        email: authUser.email || null,
        nome: (org as { display_name: string | null } | null)?.display_name ?? null,
      });
      conta = criada.id;
    }

    // O segredo do aviso da plataforma: o desta linha, o de outra linha conectada, ou um aviso novo.
    let segredoCifrado = linhaAtual?.stripe_connect_webhook_secret_encrypted ?? null;
    if (segredoCifrado && !(await decryptWebhookSecret(admin, segredoCifrado))) segredoCifrado = null;
    if (!segredoCifrado) {
      const { data: outra } = await admin
        .from("payment_gateway_connections")
        .select("stripe_connect_webhook_secret_encrypted")
        .eq("provider", "stripe")
        .not("stripe_connect_webhook_secret_encrypted", "is", null)
        .limit(1)
        .maybeSingle();
      const daOutra =
        (outra as { stripe_connect_webhook_secret_encrypted: string } | null)
          ?.stripe_connect_webhook_secret_encrypted ?? null;
      // Só reaproveita o que abre: um segredo cifrado com outra chave mestra não confere aviso nenhum.
      if (daOutra && (await decryptWebhookSecret(admin, daOutra))) segredoCifrado = daOutra;
      else {
        const aviso = await criarAvisoDaPlataforma(cfg, `${base}${ENDERECO_DO_AVISO}`);
        segredoCifrado = await encryptWebhookSecret(admin, aviso.segredo);
        if (!segredoCifrado) return { ok: false, error: "cifra_indisponivel" };
      }
    }

    const { data: gravada, error } = await admin
      .from("payment_gateway_connections")
      .upsert(
        {
          organization_id: orgId,
          provider: "stripe",
          environment: "production",
          enabled: linhaAtual?.enabled ?? true,
          stripe_account_id: conta,
          stripe_connect_webhook_secret_encrypted: segredoCifrado,
          updated_by: authUser.id,
        },
        { onConflict: "organization_id,provider" },
      )
      .select("id")
      .single();
    if (error || !gravada) return { ok: false, error: "erro_ao_gravar" };

    await audit({
      action: "payment_gateway_connection.updated",
      actorUserId: authUser.id,
      organizationId: orgId,
      resourceType: "payment_gateway_connections",
      resourceId: (gravada as { id: string }).id,
      requestId: hdrs.get("x-request-id") ?? undefined,
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      userAgent: hdrs.get("user-agent") ?? undefined,
      metadata: {
        provider: "stripe",
        origem: "conectar_com_stripe",
        conta_criada: criadaAgora,
        stripe_account_id: conta,
      },
    });
    revalidatePath("/app/settings/pagamentos");
    const url = await connect.linkDeCadastro(conta, {
      voltar: `${base}/app/settings/pagamentos?stripe=voltou`,
      renovar: `${base}/app/settings/pagamentos?stripe=renovar`,
    });
    return { ok: true, url };
  } catch (e) {
    // A conta da instalação sem o Connect ativado recusa criar conta conectada.
    if (e instanceof ErroDaStripe && /connect/i.test(e.message))
      return { ok: false, error: "connect_desligado" };
    logger.error("[stripe.connect] não abriu o cadastro", {
      organizationId: orgId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, error: "provedor_indisponivel" };
  }
}
