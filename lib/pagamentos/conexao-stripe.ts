/**
 * A conexão da organização com a Stripe, já decifrada — para o turno (criar o Pix) e para o aviso de
 * pagamento (conferir a assinatura). Mesma cifra do resto do produto (`lib/webhooks/secrets.ts`).
 *
 * Nunca lança: falha de leitura ou de decifragem devolve `null`, e quem chama segue pelo link de pagamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { configuracaoDaStripeDosPlanos } from "@/lib/planos/stripe-dos-planos";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import type { CredencialStripe } from "./stripe";
import { regraDaTaxaDaInstalacao } from "./taxa-da-instalacao";

/**
 * A conexão pronta para cobrar. É uma `CredencialStripe`: quem cobra passa a conexão inteira para
 * `criarClienteStripe(conexao)`, e a conta conectada e a taxa da plataforma vão junto sem ninguém lembrar.
 *
 * Dois jeitos de existir:
 *   - CONECTAR COM STRIPE (`stripe_account_id` pronta): `chave` é a da instalação, `conta` é a da empresa e
 *     `taxa` é a regra da taxa da plataforma. O aviso de pagamento é o da plataforma (`/webhooks/stripe-connect`).
 *   - CHAVE COLADA (o jeito antigo): `chave` é a da empresa, sem `conta` e sem taxa.
 * A conta conectada vence quando está pronta para receber.
 */
export interface ConexaoStripe extends CredencialStripe {
  id: string;
  organizationId: string;
  /** Segredo da assinatura do aviso; `null` enquanto o aviso não foi registrado. */
  segredoDoAviso: string | null;
}

interface Linha {
  id: string;
  organization_id: string;
  api_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  enabled: boolean;
  stripe_account_id: string | null;
  stripe_pronta: boolean;
}

async function decifrar(
  admin: SupabaseClient,
  linha: Linha | null,
  uso: "cobrar" | "aviso-chave" | "aviso-connect" = "cobrar",
): Promise<ConexaoStripe | null> {
  // Pausar novas cobranças não cancela o recebimento das que já foram emitidas.
  if (!linha || (uso === "cobrar" && !linha.enabled)) return null;
  const segredoDoAviso = linha.webhook_secret_encrypted
    ? await decryptWebhookSecret(admin, linha.webhook_secret_encrypted)
    : null;
  // Conectar com Stripe: a chave é a da instalação. Sem ela (a instalação tirou a chave do .env), a conta
  // conectada não tem como ser usada — cai na chave colada, se houver.
  const daInstalacao = configuracaoDaStripeDosPlanos()?.chave ?? null;
  if (
    uso !== "aviso-chave" &&
    linha.stripe_account_id &&
    (linha.stripe_pronta || uso === "aviso-connect") &&
    daInstalacao
  ) {
    return {
      id: linha.id,
      organizationId: linha.organization_id,
      chave: daInstalacao,
      conta: linha.stripe_account_id,
      taxa: regraDaTaxaDaInstalacao(),
      segredoDoAviso: segredoDoAviso ?? null,
    };
  }
  // O evento da conta conectada nunca deve consultar a conta da chave colada.
  if (uso === "aviso-connect") return null;
  if (!linha.api_key_encrypted) return null;
  const chave = await decryptWebhookSecret(admin, linha.api_key_encrypted);
  if (!chave) return null;
  return {
    id: linha.id,
    organizationId: linha.organization_id,
    chave,
    segredoDoAviso: segredoDoAviso ?? null,
  };
}

const COLUNAS =
  "id, organization_id, api_key_encrypted, webhook_secret_encrypted, enabled, stripe_account_id, stripe_pronta";

/** A conexão ligada desta organização, ou `null`. ⚠️ Filtro de organização: o client é service-role. */
export async function lerConexaoStripe(
  admin: SupabaseClient,
  organizationId: string,
): Promise<ConexaoStripe | null> {
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select(COLUNAS)
    .eq("organization_id", organizationId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error) {
    logger.error("[stripe.conexao] leitura falhou", { organizationId, error: error.message });
    return null;
  }
  return decifrar(admin, data as Linha | null);
}

/** A conexão pelo id que vai no endereço do aviso. A organização sai DA LINHA, nunca do corpo do aviso. */
export async function lerConexaoStripePorId(
  admin: SupabaseClient,
  conexaoId: string,
): Promise<ConexaoStripe | null> {
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select(COLUNAS)
    .eq("id", conexaoId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error) return null;
  return decifrar(admin, data as Linha | null, "aviso-chave");
}

/**
 * A conexão pela conta conectada — é como o aviso da plataforma (`/webhooks/stripe-connect`) acha a empresa:
 * pelo `account` do evento, que a Stripe assina. A organização sai DA LINHA, nunca do corpo do aviso.
 */
export async function lerConexaoStripePorConta(
  admin: SupabaseClient,
  conta: string,
): Promise<ConexaoStripe | null> {
  if (!/^acct_[A-Za-z0-9]+$/.test(conta)) return null;
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select(COLUNAS)
    .eq("provider", "stripe")
    .eq("stripe_account_id", conta)
    .maybeSingle();
  if (error) return null;
  return decifrar(admin, data as Linha | null, "aviso-connect");
}

/**
 * O segredo do aviso da plataforma e a organização dona de uma conta conectada — SEM exigir que a conta esteja
 * pronta para receber. É o que o aviso `account.updated` precisa: ele chega justamente enquanto a conta ainda
 * está em cadastro. Nada aqui serve para cobrar (não há chave): só para conferir a assinatura e achar a linha.
 */
export async function lerAvisoDaContaConectada(
  admin: SupabaseClient,
  conta: string,
): Promise<{ id: string; organizationId: string; segredoDoAviso: string | null } | null> {
  if (!/^acct_[A-Za-z0-9]+$/.test(conta)) return null;
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select("id, organization_id, stripe_connect_webhook_secret_encrypted")
    .eq("provider", "stripe")
    .eq("stripe_account_id", conta)
    .maybeSingle();
  if (error || !data) return null;
  const linha = data as {
    id: string;
    organization_id: string;
    stripe_connect_webhook_secret_encrypted: string | null;
  };
  const cifrado = linha.stripe_connect_webhook_secret_encrypted;
  const segredoDoAviso = cifrado ? await decryptWebhookSecret(admin, cifrado) : null;
  return {
    id: linha.id,
    organizationId: linha.organization_id,
    segredoDoAviso: segredoDoAviso ?? null,
  };
}
