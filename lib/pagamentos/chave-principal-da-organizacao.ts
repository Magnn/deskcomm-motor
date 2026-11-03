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
    .select("id, priority, published_version_id, config")
    .eq("organization_id", organizationId)
    .is("archived_at", null)
    .eq("config->pricing->pix_key->>primary", "true");
  // Falha de leitura sobe: cobrar pelo provedor por engano mandaria o dinheiro para outra conta.
  if (error) throw new Error(`chave_principal_nao_lida: ${error.message}`);
  return escolherChavePrincipal((data ?? []) as AgenteComChave[]);
}

export interface AgenteComChave {
  id: string;
  priority: number | null;
  published_version_id: string | null;
  config?: { pricing?: Pick<PricingConfig, "pix_key"> } | null;
}

/**
 * Pura. Antes era `limit(1)` sem ordem: com dois agentes com chave principal DIFERENTE (a chave nova num, a antiga
 * esquecida noutro), o banco sorteava qual saía no botão "Enviar Pix" e no fluxo. Agora: o agente publicado de maior
 * prioridade vence (o mesmo que atende), e o desempate é estável (id).
 */
export function escolherChavePrincipal(agentes: readonly AgenteComChave[]): ChavePixDaEmpresa | null {
  const comChave = agentes
    .map((a) => ({ a, chave: chavePrincipal(a.config?.pricing) }))
    .filter((x): x is { a: AgenteComChave; chave: ChavePixDaEmpresa } => x.chave !== null)
    .sort(
      (x, y) =>
        Number(y.a.published_version_id !== null) - Number(x.a.published_version_id !== null) ||
        (y.a.priority ?? 0) - (x.a.priority ?? 0) ||
        (x.a.id < y.a.id ? -1 : x.a.id > y.a.id ? 1 : 0),
    );
  return comChave[0]?.chave ?? null;
}
