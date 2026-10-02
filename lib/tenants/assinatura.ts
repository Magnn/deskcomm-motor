/**
 * ASSINATURA LIGA E DESLIGA O ACESSO.
 *
 * Quem vende o produto como serviço precisa que o pagamento mande no acesso:
 * pagou → a empresa do cliente existe e ele consegue entrar; deixou de pagar →
 * a empresa é suspensa e as automações dela param. Antes isso era só manual, no
 * painel do dono da instalação.
 *
 * Este módulo é a regra; a porta é `POST /api/v1/tenants/subscription`, guardada
 * pelo MESMO segredo do provisionamento (`TENANT_PROVISIONING_SECRET`) — é o dono
 * da instalação (ou a automação de pagamento dele) quem chama, nunca um cliente.
 *
 * A empresa é reencontrada pelo par (integração, id externo), o mesmo do
 * provisionamento: o id externo é o da ASSINATURA (ou do cliente) na plataforma
 * de pagamento, e é ele que aparece em todo aviso que ela manda.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { provisionExternalTenant, slugDoProvisionamento } from "@/lib/auth/provision";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface AssinaturaInput {
  integration: string;
  externalId: string;
  /** Só são exigidos quando a empresa ainda não existe (primeiro pagamento). */
  organizationName?: string;
  ownerEmail?: string;
  ownerName?: string;
  reason?: string;
  requestId: string;
}

export type ResultadoDaAssinatura =
  | {
      ok: true;
      organizationId: string;
      status: "active" | "suspended";
      /** `true` só na chamada que CRIOU a empresa. */
      criada: boolean;
      /**
       * Link de uso único para o dono definir a senha — só na criação. Vale pouco
       * tempo (o prazo do servidor de autenticação); vencido, o caminho é o
       * "Esqueci minha senha" da tela de entrada, com o mesmo e-mail.
       */
      linkDeAcesso: string | null;
      /** Quantos fluxos em andamento foram encerrados pela suspensão. */
      fluxosEncerrados: number;
    }
  | { ok: false; motivo: "empresa_nao_encontrada" | "dados_do_dono_faltando" };

type Admin = SupabaseClient;

const MOTIVO_PADRAO_DA_SUSPENSAO = "Assinatura inativa (informado pela plataforma de pagamento).";

async function acharEmpresa(
  admin: Admin,
  integration: string,
  externalId: string,
): Promise<{ id: string; status: string; created_by: string | null } | null> {
  const { data, error } = await admin
    .from("organizations")
    .select("id, status, created_by, settings")
    .eq("slug", slugDoProvisionamento(integration, externalId))
    .maybeSingle();
  if (error) throw new Error(`assinatura: busca da empresa falhou: ${error.message}`);
  if (!data) return null;
  // O slug é derivado do par, mas o MARCADOR é a prova: uma empresa criada à mão
  // com o mesmo slug não é desta assinatura, e não pode ser suspensa por ela.
  const m = (data.settings as { provisioning?: { integration?: unknown; external_id?: unknown } } | null)?.provisioning;
  if (m?.integration !== integration || m?.external_id !== externalId) return null;
  return { id: data.id, status: data.status, created_by: data.created_by };
}

/**
 * Encerra o que está rodando para a empresa: sem isto, "suspender" fecharia a
 * tela e deixaria os fluxos em andamento continuarem enviando mensagem.
 */
export async function encerrarFluxosDaEmpresa(admin: Admin, organizationId: string, motivo: string): Promise<number> {
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("followup_enrollments")
    .update({
      status: "cancelled",
      cancel_reason: motivo,
      completed_at: agora,
      next_eval_at: null,
      claimed_until: null,
      updated_at: agora,
    })
    .eq("organization_id", organizationId)
    .in("status", ["active", "waiting_reply", "dormente", "paused_handoff", "paused_manual", "coletando"])
    .select("id");
  if (error) throw new Error(`assinatura: encerrar fluxos falhou: ${error.message}`);
  return data?.length ?? 0;
}

async function gerarLinkDeAcesso(admin: Admin, email: string, requestId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      logger.warn("[tenants.subscription] não gerou o link de acesso", { requestId, erro: error?.message ?? "sem token" });
      return null;
    }
    // Formato `token_hash`: não depende de cookie nem do modelo de e-mail — é o
    // que `/auth/confirm` verifica direto.
    const base = env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    return `${base}/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
  } catch (err) {
    logger.warn("[tenants.subscription] não gerou o link de acesso", {
      requestId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Assinatura paga/ativa: a empresa existe e está liberada. Idempotente. */
export async function ativarAssinatura(input: AssinaturaInput): Promise<ResultadoDaAssinatura> {
  const admin = createAdminClient();
  const existente = await acharEmpresa(admin, input.integration, input.externalId);

  if (existente) {
    if (existente.status === "suspended") {
      const agora = new Date().toISOString();
      const { error } = await admin
        .from("organizations")
        .update({ status: "active", suspended_at: null, suspended_reason: null, suspended_by: null, updated_at: agora })
        .eq("id", existente.id);
      if (error) throw new Error(`assinatura: reativar falhou: ${error.message}`);
      void audit({
        action: "tenant.reactivated",
        organizationId: existente.id,
        resourceType: "organization",
        resourceId: existente.id,
        requestId: input.requestId,
        metadata: { origem: "assinatura", integration: input.integration },
      });
    }
    return { ok: true, organizationId: existente.id, status: "active", criada: false, linkDeAcesso: null, fluxosEncerrados: 0 };
  }

  if (!input.organizationName || !input.ownerEmail || !input.ownerName) {
    return { ok: false, motivo: "dados_do_dono_faltando" };
  }

  const { organizationId, replay } = await provisionExternalTenant({
    integration: input.integration,
    externalId: input.externalId,
    organizationName: input.organizationName,
    ownerEmail: input.ownerEmail,
    ownerName: input.ownerName,
    requestId: input.requestId,
  });

  const linkDeAcesso = replay ? null : await gerarLinkDeAcesso(admin, input.ownerEmail.trim().toLowerCase(), input.requestId);
  return { ok: true, organizationId, status: "active", criada: !replay, linkDeAcesso, fluxosEncerrados: 0 };
}

/** Assinatura cancelada/vencida: a empresa é suspensa e os fluxos dela param. Idempotente. */
export async function suspenderAssinatura(input: AssinaturaInput): Promise<ResultadoDaAssinatura> {
  const admin = createAdminClient();
  const existente = await acharEmpresa(admin, input.integration, input.externalId);
  if (!existente) return { ok: false, motivo: "empresa_nao_encontrada" };

  const motivo = input.reason?.trim() || MOTIVO_PADRAO_DA_SUSPENSAO;
  if (existente.status !== "suspended") {
    const agora = new Date().toISOString();
    const { error } = await admin
      .from("organizations")
      .update({ status: "suspended", suspended_at: agora, suspended_reason: motivo, suspended_by: null, updated_at: agora })
      .eq("id", existente.id);
    if (error) throw new Error(`assinatura: suspender falhou: ${error.message}`);
    void audit({
      action: "tenant.suspended",
      organizationId: existente.id,
      resourceType: "organization",
      resourceId: existente.id,
      requestId: input.requestId,
      metadata: { origem: "assinatura", integration: input.integration, reason: motivo },
    });
  }
  // Sempre: uma suspensão repetida ainda encerra o que tiver sobrado vivo.
  const fluxosEncerrados = await encerrarFluxosDaEmpresa(admin, existente.id, "Empresa suspensa: assinatura inativa.");
  return { ok: true, organizationId: existente.id, status: "suspended", criada: false, linkDeAcesso: null, fluxosEncerrados };
}
