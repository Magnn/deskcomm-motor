/**
 * A conexão de cobrança DESTA organização, já decifrada. Mesma cifra e mesma decifragem do resto do
 * produto (`lib/webhooks/secrets.ts`) — sem terceiro caminho.
 *
 * Nunca lança por causa da chave: falha de leitura ou decifragem vira um motivo nomeado, e quem chama decide
 * o que dizer a quem configura (o motivo é o que a tela e o erro do passo mostram).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";

import type { CredencialAsaas } from "./asaas";

export type MotivoSemCobranca = "sem_conexao" | "conexao_desabilitada" | "credencial_incompleta" | "cifra_indisponivel";

export type LeituraDeCobranca =
  | { ok: true; credencial: CredencialAsaas }
  | { ok: false; motivo: MotivoSemCobranca };

export const MOTIVO_DA_COBRANCA: Record<MotivoSemCobranca, string> = {
  sem_conexao: "Nenhuma conta de cobrança conectada. Conecte o Asaas em Configurações › Pagamentos.",
  conexao_desabilitada: "A conexão de cobrança está desligada. Ligue-a em Configurações › Pagamentos.",
  credencial_incompleta: "Falta a chave de API da conexão de cobrança. Complete em Configurações › Pagamentos.",
  cifra_indisponivel: "Esta instalação está sem a chave mestra de criptografia — quem instalou o sistema precisa configurá-la.",
};

export async function lerCredencialDeCobranca(admin: SupabaseClient, organizationId: string): Promise<LeituraDeCobranca> {
  // ⚠️ Filtro de organização: o client é service-role e ignora RLS.
  const { data, error } = await admin
    .from("payment_gateway_connections")
    .select("api_key_encrypted, environment, enabled")
    .eq("organization_id", organizationId)
    .eq("provider", "asaas")
    .maybeSingle();
  if (error) {
    logger.error("[cobranca.credencial] leitura falhou", { organizationId, error: error.message });
    return { ok: false, motivo: "sem_conexao" };
  }
  if (!data) return { ok: false, motivo: "sem_conexao" };
  const linha = data as { api_key_encrypted: string | null; environment: string; enabled: boolean };
  if (!linha.enabled) return { ok: false, motivo: "conexao_desabilitada" };
  if (!linha.api_key_encrypted) return { ok: false, motivo: "credencial_incompleta" };
  const apiKey = await decryptWebhookSecret(admin, linha.api_key_encrypted);
  if (!apiKey) return { ok: false, motivo: "cifra_indisponivel" };
  return { ok: true, credencial: { apiKey, ambiente: linha.environment === "sandbox" ? "sandbox" : "production" } };
}
