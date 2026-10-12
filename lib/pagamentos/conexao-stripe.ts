/**
 * A conexão da organização com a Stripe, já decifrada — para o turno (criar o Pix) e para o aviso de
 * pagamento (conferir a assinatura). Mesma cifra do resto do produto (`lib/webhooks/secrets.ts`).
 *
 * Nunca lança: falha de leitura ou de decifragem devolve `null`, e quem chama segue pelo link de pagamento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

export interface ConexaoStripe {
  id: string;
  organizationId: string;
  chave: string;
  /** Segredo da assinatura do aviso; `null` enquanto o aviso não foi registrado. */
  segredoDoAviso: string | null;
}

interface Linha {
  id: string;
  organization_id: string;
  api_key_encrypted: string | null;
  webhook_secret_encrypted: string | null;
  enabled: boolean;
}

async function decifrar(admin: SupabaseClient, linha: Linha | null): Promise<ConexaoStripe | null> {
  if (!linha || !linha.enabled || !linha.api_key_encrypted) return null;
  const chave = await decryptWebhookSecret(admin, linha.api_key_encrypted);
  if (!chave) return null;
  const segredoDoAviso = linha.webhook_secret_encrypted ? await decryptWebhookSecret(admin, linha.webhook_secret_encrypted) : null;
  return { id: linha.id, organizationId: linha.organization_id, chave, segredoDoAviso: segredoDoAviso ?? null };
}

const COLUNAS = "id, organization_id, api_key_encrypted, webhook_secret_encrypted, enabled";

/** A conexão ligada desta organização, ou `null`. ⚠️ Filtro de organização: o client é service-role. */
export async function lerConexaoStripe(admin: SupabaseClient, organizationId: string): Promise<ConexaoStripe | null> {
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
export async function lerConexaoStripePorId(admin: SupabaseClient, conexaoId: string): Promise<ConexaoStripe | null> {
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select(COLUNAS)
    .eq("id", conexaoId)
    .eq("provider", "stripe")
    .maybeSingle();
  if (error) return null;
  return decifrar(admin, data as Linha | null);
}
