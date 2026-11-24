/**
 * CAPACIDADE DE HOJE — "o atendimento aguenta mais conversas?", a pergunta que vem ANTES de subir verba.
 *
 * Soma, nos números com agente publicado, os leads novos de hoje contra o orçamento de leads de hoje
 * (o mesmo que o rodízio usa para escolher número; ver `cargaDosNumeros`). Número sem orçamento não
 * tem teto: se nenhum tem, a capacidade sai sem total (`orcamento: null`) e o painel diz só a carga.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { cargaDosNumeros, sessoesDoRodizio } from "@/lib/plataformas-de-anuncio/rodizio-de-numeros";

export interface CapacidadeDeHoje {
  numeros: number;
  leadsHoje: number;
  /** Soma dos orçamentos de hoje dos números que TÊM orçamento; `null` quando nenhum tem. */
  orcamento: number | null;
  /** Números que já bateram o orçamento de hoje. */
  cheios: number;
}

export function somarCapacidade(cargas: Iterable<{ leadsHoje: number; aCaminho: number; orcamentoHoje: number | null }>): CapacidadeDeHoje {
  let numeros = 0;
  let leadsHoje = 0;
  let orcamento: number | null = null;
  let cheios = 0;
  for (const c of cargas) {
    numeros += 1;
    leadsHoje += c.leadsHoje;
    if (c.orcamentoHoje !== null) {
      orcamento = (orcamento ?? 0) + c.orcamentoHoje;
      if (c.leadsHoje + c.aCaminho >= c.orcamentoHoje) cheios += 1;
    }
  }
  return { numeros, leadsHoje, orcamento, cheios };
}

export async function capacidadeDeHoje(admin: SupabaseClient, organizationId: string): Promise<CapacidadeDeHoje | null> {
  const sessoes = await sessoesDoRodizio(admin, organizationId);
  if (sessoes.length === 0) return null;
  const cargas = await cargaDosNumeros(admin, organizationId, sessoes);
  return somarCapacidade(cargas.values());
}
