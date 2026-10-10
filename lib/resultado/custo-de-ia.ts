/**
 * QUANTO A IA CONSUMIU NO PERÍODO DO PAINEL — tokens, chamadas e custo, ao lado das vendas.
 *
 * O número mora em Agente de IA › Uso de IA, mas é no painel de vendas que ele vira decisão: quanto
 * custou a IA por venda fechada. A leitura é a MESMA daquela tela (`fn_uso_de_ia`, migration 0920),
 * com o recorte de datas do painel — uma verdade só para o consumo.
 *
 * ─── Moeda ────────────────────────────────────────────────────────────────────────────────────────
 * O custo é em DÓLAR, a moeda em que o fornecedor de IA cobra (`llm_calls.cost_cents`). Ele NÃO entra
 * no lucro do painel, que é em real: sem uma cotação escolhida por alguém, converter seria inventar
 * um número com aparência de certo — a mesma regra do gasto de anúncio em outra moeda.
 *
 * ─── Desconhecido não vira zero ───────────────────────────────────────────────────────────────────
 * Se a leitura falhar, volta `null` e o cartão diz "—". Zero aqui é zero de verdade.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { LinhaDeUso } from "@/lib/ai/usage/aggregate";

export interface ConsumoDeIa {
  /** Centavo de dólar, fracionário. */
  custoCents: number;
  tokensLidos: number;
  tokensEscritos: number;
  chamadas: number;
  /** Chamadas com tokens e sem preço conhecido: o custo acima é MENOR que o real. */
  chamadasSemPreco: number;
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** O total do período, tirado das linhas de `fn_uso_de_ia` (a de `nivel` 3). Pura. */
export function consumoDoPeriodo(linhas: readonly LinhaDeUso[]): ConsumoDeIa {
  const total = linhas.find((l) => l.nivel === 3);
  return {
    custoCents: n(total?.custo_cents),
    tokensLidos: n(total?.tokens_de_entrada),
    tokensEscritos: n(total?.tokens_de_saida),
    chamadas: n(total?.chamadas),
    chamadasSemPreco: n(total?.chamadas_sem_preco),
  };
}

/** Custo de IA por venda, em dólar. Sem venda não há divisão: `null`, nunca zero. Pura. */
export function custoDeIaPorVenda(consumo: ConsumoDeIa | null, vendas: number): number | null {
  if (consumo === null || vendas <= 0) return null;
  return consumo.custoCents / 100 / vendas;
}

/**
 * `admin` é o client de serviço: a organização vem de quem chama, resolvida da sessão — nunca do
 * corpo do pedido.
 */
export async function lerConsumoDeIa(
  admin: SupabaseClient,
  organizationId: string,
  inicio: Date,
  fim: Date,
): Promise<ConsumoDeIa | null> {
  const { data, error } = await admin.rpc("fn_uso_de_ia", {
    p_org: organizationId,
    p_de: inicio.toISOString(),
    p_ate: fim.toISOString(),
  });
  if (error) return null;
  return consumoDoPeriodo((data ?? []) as unknown as LinhaDeUso[]);
}
