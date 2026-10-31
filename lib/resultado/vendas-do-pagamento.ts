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
 *
 * O AJUSTE (`adjustment` com `related_event_id`) corrige a cobrança a que aponta. Medido em 31/10/2026: um
 * Pix registrado duas vezes foi anulado no livro em 15/10, e o painel seguiu somando os R$ 130.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerTodasAsLinhas } from "./ler-todas-as-linhas";

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
  /** A conversa da cobrança (vendas do gateway). Ausente na comanda. */
  conversation_id?: string | null;
  /** Cobrança avulsa (`metadata.extra`): é receita, mas não é uma venda do produto principal. */
  extra?: boolean;
}

export interface LinhaDoLedger {
  id: string;
  event_type: string;
  amount_cents: number | string;
  occurred_at: string;
  contact_id: string | null;
  external_event_id: string;
  /** O que o pagamento registrou: `produto` (nome) e `conversa` (de onde veio a cobrança). */
  metadata?: { produto?: unknown; conversa?: unknown; extra?: unknown } | null;
}

const ESTORNOS = ["refund", "chargeback"];

/** As cobranças do período que continuam de pé, como vendas do painel. Pura. */
export function vendasDoLedger(
  cobrancas: readonly LinhaDoLedger[],
  pedidosEstornados: ReadonlySet<string>,
  /** Soma dos ajustes por id da cobrança (negativa quando tira valor). */
  ajustes: ReadonlyMap<string, number> = new Map(),
): VendaDoPainel[] {
  const valor = (l: LinhaDoLedger): number => (Number(l.amount_cents) || 0) + (ajustes.get(l.id) ?? 0);
  return cobrancas
    .filter((l) => l.event_type === "charge" && !pedidosEstornados.has(l.external_event_id) && valor(l) > 0)
    .map((l) => ({
      id: l.id,
      number: null,
      contact_id: l.contact_id,
      status: "paid",
      total_cents: valor(l),
      created_at: l.occurred_at,
      attendant_user_id: null,
      // O nome do produto que o pagamento registrou: é ele que o histórico e a performance de produtos mostram.
      notes: typeof l.metadata?.produto === "string" && l.metadata.produto.trim() !== "" ? l.metadata.produto.trim() : null,
      conversation_id: typeof l.metadata?.conversa === "string" ? l.metadata.conversa : null,
      extra: typeof l.metadata?.extra === "string" && l.metadata.extra !== "",
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
  const cobrancas = await lerTodasAsLinhas<LinhaDoLedger>((inicio, fim) =>
    db
      .from("revenue_ledger")
      .select("id, event_type, amount_cents, occurred_at, contact_id, external_event_id, metadata")
      .eq("organization_id", organizationId)
      .eq("event_type", "charge")
      .gte("occurred_at", de.toISOString())
      .lte("occurred_at", ate.toISOString())
      .order("occurred_at", { ascending: false })
      .order("id")
      .range(inicio, fim),
  ).catch((err: Error) => {
    throw new Error(`vendas do pagamento: leitura das cobranças falhou: ${err.message}`);
  });
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
  const ajustes = new Map<string, number>();
  for (let i = 0; i < cobrancas.length; i += LOTE) {
    const { data: aj, error: e } = await db
      .from("revenue_ledger")
      .select("related_event_id, amount_cents")
      .eq("organization_id", organizationId)
      .eq("event_type", "adjustment")
      .in("related_event_id", cobrancas.slice(i, i + LOTE).map((c) => c.id));
    if (e) throw new Error(`vendas do pagamento: leitura dos ajustes falhou: ${e.message}`);
    for (const l of (aj ?? []) as { related_event_id: string; amount_cents: number | string }[]) {
      ajustes.set(l.related_event_id, (ajustes.get(l.related_event_id) ?? 0) + (Number(l.amount_cents) || 0));
    }
  }
  return vendasDoLedger(cobrancas, estornados, ajustes);
}
