/**
 * Montagem pura do payload da tela Uso de IA.
 *
 * A SOMA é do banco (`fn_uso_de_ia`, migration 0920). Antes este arquivo recebia as chamadas
 * linha por linha — herança de `ai_invocations` — e a REST entregava no máximo 1.000 delas:
 * medido em 09/10/2026, 1.000 de 177.579. Aqui só se arruma o que o banco já somou.
 */

/** Uma linha de `fn_uso_de_ia`. `nivel`: 0 = dia + finalidade; 1 = o dia; 3 = o período. */
export interface LinhaDeUso {
  nivel: number;
  dia: string | null;
  finalidade: string | null;
  chamadas: number;
  tokens_de_entrada: number;
  tokens_de_saida: number;
  tokens_reaproveitados: number;
  custo_cents: number;
  chamadas_sem_preco: number;
  p50_ms: number;
  p95_ms: number;
}

/** Uma linha de `fn_recebidas_e_passagens_por_dia`. */
export interface DiaDeConversa {
  dia: string;
  recebidas: number;
  passagens: number;
}

export interface UsoPorFinalidade {
  kind: string;
  invocations: number;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  cost_cents: number;
}

export interface UsagePayload {
  range: { from: string; to: string };
  totals: {
    cost_cents: number;
    total_tokens: number;
    /** Tudo o que a IA LEU. Inclui `cached_tokens`. */
    input_tokens: number;
    /** O que a IA ESCREVEU. */
    output_tokens: number;
    /** A parte da leitura que o fornecedor reaproveitou e cobrou com desconto. */
    cached_tokens: number;
    invocations: number;
    /** Chamadas com tokens e SEM custo: o produto não sabe o preço do modelo. */
    unpriced_invocations: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    handoff_rate: number;
  };
  series: {
    cost_cents: Array<{ day: string; value: number }>;
    total_tokens: Array<{ day: string; value: number }>;
    p50_latency_ms: Array<{ day: string; value: number }>;
    p95_latency_ms: Array<{ day: string; value: number }>;
    handoff_rate: Array<{ day: string; value: number }>;
  };
  by_kind: Record<string, number>;
  /** Para onde foram os tokens, da finalidade que mais consumiu para a que menos. */
  kinds: UsoPorFinalidade[];
}

/** Format a Date as YYYY-MM-DD in UTC. */
export function toUtcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Build a contiguous list of UTC day strings from `from` to `to` inclusive. */
export function daysBetween(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor.getTime() <= end.getTime()) {
    out.push(toUtcDay(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function montarUso(
  linhas: readonly LinhaDeUso[],
  conversa: readonly DiaDeConversa[],
  range: { from: Date; to: Date },
): UsagePayload {
  const days = daysBetween(range.from, range.to);
  const doDia = new Map<string, LinhaDeUso>();
  const porFinalidade = new Map<string, UsoPorFinalidade>();
  let total: LinhaDeUso | null = null;

  for (const l of linhas) {
    if (l.nivel === 3) total = l;
    else if (l.nivel === 1 && l.dia) doDia.set(l.dia, l);
    else if (l.nivel === 0 && l.finalidade) {
      const f = porFinalidade.get(l.finalidade) ?? {
        kind: l.finalidade,
        invocations: 0,
        input_tokens: 0,
        output_tokens: 0,
        cached_tokens: 0,
        cost_cents: 0,
      };
      f.invocations += n(l.chamadas);
      f.input_tokens += n(l.tokens_de_entrada);
      f.output_tokens += n(l.tokens_de_saida);
      f.cached_tokens += n(l.tokens_reaproveitados);
      f.cost_cents += n(l.custo_cents);
      porFinalidade.set(l.finalidade, f);
    }
  }

  const recebidas = new Map(conversa.map((c) => [c.dia, n(c.recebidas)]));
  const passagens = new Map(conversa.map((c) => [c.dia, n(c.passagens)]));
  let totalRecebidas = 0;
  let totalPassagens = 0;

  const series: UsagePayload["series"] = {
    cost_cents: [],
    total_tokens: [],
    p50_latency_ms: [],
    p95_latency_ms: [],
    handoff_rate: [],
  };
  for (const day of days) {
    const l = doDia.get(day);
    const inb = recebidas.get(day) ?? 0;
    const hand = passagens.get(day) ?? 0;
    totalRecebidas += inb;
    totalPassagens += hand;
    series.cost_cents.push({ day, value: n(l?.custo_cents) });
    series.total_tokens.push({ day, value: n(l?.tokens_de_entrada) + n(l?.tokens_de_saida) });
    series.p50_latency_ms.push({ day, value: n(l?.p50_ms) });
    series.p95_latency_ms.push({ day, value: n(l?.p95_ms) });
    series.handoff_rate.push({ day, value: inb > 0 ? Number((hand / inb).toFixed(4)) : 0 });
  }

  const kinds = [...porFinalidade.values()].sort(
    (a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens),
  );
  const entrada = n(total?.tokens_de_entrada);
  const saida = n(total?.tokens_de_saida);

  return {
    range: { from: toUtcDay(range.from), to: toUtcDay(range.to) },
    totals: {
      cost_cents: n(total?.custo_cents),
      total_tokens: entrada + saida,
      input_tokens: entrada,
      output_tokens: saida,
      cached_tokens: n(total?.tokens_reaproveitados),
      invocations: n(total?.chamadas),
      unpriced_invocations: n(total?.chamadas_sem_preco),
      p50_latency_ms: n(total?.p50_ms),
      p95_latency_ms: n(total?.p95_ms),
      handoff_rate: totalRecebidas > 0 ? Number((totalPassagens / totalRecebidas).toFixed(4)) : 0,
    },
    series,
    by_kind: Object.fromEntries(kinds.map((k) => [k.kind, k.invocations])),
    kinds,
  };
}
