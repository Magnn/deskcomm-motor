/**
 * AS VENDAS QUE CHEGAM PELO GATEWAY DE PAGAMENTO, na forma que o dashboard já soma.
 *
 * O dashboard nasceu lendo só `sales` (a comanda interna). Quem vende pelo link de pagamento — o caminho
 * comum de quem atende pelo WhatsApp — não passa pela comanda: a compra aprovada entra em
 * `revenue_ledger` (0416). Sem isto, faturamento, vendas, ticket médio e conversão ficavam em zero para
 * uma empresa que vendeu o dia inteiro.
 *
 * A cobrança ESTORNADA não é venda: uma `charge` com `refund` ou `chargeback` do mesmo pedido
 * (`external_event_id` é o id do pedido nas três linhas) sai da conta, como a comanda cancelada já sai.
 * O estorno conta em qualquer data: uma venda de ontem devolvida hoje deixa de ser venda de ontem.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** O recorte de `sales` que o dashboard usa. As vendas do pagamento chegam nesta mesma forma. */
export interface VendaDoPainel {
  id: string;
  number: number | null;
  contact_id: string | null;
  status: string;
  total_cents: number;
  created_at: string;
  attendant_user_id: string | null;
  notes: string | null;
}

export interface LinhaDoLedger {
  id: string;
  event_type: string;
  amount_cents: number | string;
  occurred_at: string;
  contact_id: string | null;
  external_event_id: string;
}

const ESTORNOS = ["refund", "chargeback"];

/** As cobranças do período que continuam de pé, como vendas do painel. Pura. */
export function vendasDoLedger(cobrancas: readonly LinhaDoLedger[], pedidosEstornados: ReadonlySet<string>): VendaDoPainel[] {
  return cobrancas
    .filter((l) => l.event_type === "charge" && !pedidosEstornados.has(l.external_event_id))
    .map((l) => ({
      id: l.id,
      number: null,
      contact_id: l.contact_id,
      status: "paid",
      total_cents: Number(l.amount_cents) || 0,
      created_at: l.occurred_at,
      attendant_user_id: null,
      notes: null,
    }));
}

const LOTE = 200;

/** As vendas do gateway no intervalo, já sem as estornadas. */
export async function lerVendasDoPagamento(
  db: SupabaseClient,
  organizationId: string,
  de: Date,
  ate: Date,
): Promise<VendaDoPainel[]> {
  const { data, error } = await db
    .from("revenue_ledger")
    .select("id, event_type, amount_cents, occurred_at, contact_id, external_event_id")
    .eq("organization_id", organizationId)
    .eq("event_type", "charge")
    .gte("occurred_at", de.toISOString())
    .lte("occurred_at", ate.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`vendas do pagamento: leitura das cobranças falhou: ${error.message}`);
  const cobrancas = (data ?? []) as LinhaDoLedger[];
  if (cobrancas.length === 0) return [];

  const pedidos = [...new Set(cobrancas.map((c) => c.external_event_id))];
  const estornados = new Set<string>();
  for (let i = 0; i < pedidos.length; i += LOTE) {
    const { data: est, error: e } = await db
      .from("revenue_ledger")
      .select("external_event_id")
      .eq("organization_id", organizationId)
      .in("event_type", ESTORNOS)
      .in("external_event_id", pedidos.slice(i, i + LOTE));
    if (e) throw new Error(`vendas do pagamento: leitura dos estornos falhou: ${e.message}`);
    for (const l of (est ?? []) as { external_event_id: string }[]) estornados.add(l.external_event_id);
  }
  return vendasDoLedger(cobrancas, estornados);
}
