/**
 * A CHAVE PRINCIPAL DA ORGANIZAÇÃO, para quem cobra sem ter um agente na mão: o botão "Enviar Pix" do atendente e a
 * marca `[[COBRAR]]` do fluxo. A chave mora na configuração de preço do agente (`ai_agents.config.pricing.pix_key`);
 * basta um agente em uso tê-la como principal para a organização receber por ela.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { chavePrincipal, type ChavePixDaEmpresa } from "@/lib/preco/chave-pix";
import type { PricingConfig } from "@/lib/preco/tipos";

export async function chavePrincipalDaOrganizacao(admin: SupabaseClient, organizationId: string): Promise<ChavePixDaEmpresa | null> {
  const { data, error } = await admin
    .from("ai_agents")
    .select("config")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .eq("config->pricing->pix_key->>primary", "true")
    .limit(1);
  // Falha de leitura sobe: cobrar pelo provedor por engano mandaria o dinheiro para outra conta.
  if (error) throw new Error(`chave_principal_nao_lida: ${error.message}`);
  const linha = (data ?? [])[0] as { config?: { pricing?: Pick<PricingConfig, "pix_key"> } | null } | undefined;
  return chavePrincipal(linha?.config?.pricing);
}
