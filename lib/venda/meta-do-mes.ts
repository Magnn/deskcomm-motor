/**
 * A META DO MÊS POR PRODUTO: quantas vendas cada produto deve fazer no mês (`pricing.meta_mensal_por_produto`) e
 * quantas já fez. É o desempate ÚNICO de todo seletor de oferta (turno, porta aberta, catálogo, oferta proativa):
 * entre os produtos que cabem, vai primeiro o mais atrás da meta. O tema vence a meta — a meta só ordena o que o
 * tema (ou a falta dele) já deixou na mesa. Sem meta configurada, a ordem é a do operador, como sempre foi.
 *
 * Medido em 27/11/2026, 30 dias: a Pergunta nova recebeu 315 de ~360 ofertas automáticas, e 12 dos 18 produtos
 * venderam 4 vezes ou menos. Cada seletor seguia a primeira da lista que cabia, e a primeira era sempre a mesma.
 */
import type pg from "pg";

export interface MetaDoMes {
  /** Vendas que cada produto deve fazer no mês. */
  meta: number;
  /** Meta própria de alguns produtos, pela chave do produto; vence a geral. */
  porProduto?: ReadonlyMap<string, number>;
  /** Vendas do mês até agora, pela chave do produto (`chaveDoProduto`). */
  vendidos: ReadonlyMap<string, number>;
}

/** O mesmo produto escrito de jeitos diferentes ("2× Pergunta nova", "pergunta_nova") cai na mesma chave. Pura. */
export function chaveDoProduto(nome: string): string {
  return nome
    .replace(/^\s*\d+\s*[×x]\s*/i, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Quanto falta para o produto bater a meta do mês (0 quando já bateu). Pura. */
export function faltaParaAMeta(nome: string, m: MetaDoMes): number {
  const k = chaveDoProduto(nome);
  return Math.max(0, (m.porProduto?.get(k) ?? m.meta) - (m.vendidos.get(k) ?? 0));
}

/**
 * Os itens na ordem da meta: o mais atrás primeiro; empate (e meta ausente) mantém a ordem do operador. Pura.
 */
export function pelaMeta<T>(itens: readonly T[], nome: (t: T) => string, m: MetaDoMes | null | undefined): T[] {
  if (!m) return [...itens];
  return itens
    .map((t, i) => ({ t, i, falta: faltaParaAMeta(nome(t), m) }))
    .sort((a, b) => b.falta - a.falta || a.i - b.i)
    .map((x) => x.t);
}

/** Soma as linhas do livro por chave do produto. Pura. */
export function vendidosPorProduto(linhas: readonly { produto: string | null; n: number | string }[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (!l.produto) continue;
    const k = chaveDoProduto(l.produto);
    mapa.set(k, (mapa.get(k) ?? 0) + Number(l.n));
  }
  return mapa;
}

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { em: number; vendidos: Map<string, number> }>();

/**
 * Lê as vendas do mês corrente (sem estornadas) e devolve a meta pronta, ou `null` sem meta configurada ou se a
 * leitura falhar — sem a contagem, os seletores seguem a ordem do operador; a meta nunca custa a oferta.
 * Guardado 10 min por organização: o turno e a oferta proativa leem a cada mensagem, e a meta é do mês.
 */
export async function lerMetaDoMes(
  pool: Pick<pg.Pool, "query">,
  organizationId: string,
  config: { meta_mensal_por_produto?: number; metas_por_produto?: Record<string, number> } | null | undefined,
  agora: Date = new Date(),
  fuso = "America/Sao_Paulo",
): Promise<MetaDoMes | null> {
  const meta = config?.meta_mensal_por_produto;
  if (!meta) return null;
  const porProduto = new Map(Object.entries(config?.metas_por_produto ?? {}).map(([n, v]) => [chaveDoProduto(n), v] as const));
  const guardado = cache.get(organizationId);
  if (guardado && agora.getTime() - guardado.em < CACHE_MS) return { meta, porProduto, vendidos: guardado.vendidos };
  try {
    const { rows } = await pool.query<{ produto: string | null; n: number }>(
      `select nullif(l.metadata->>'produto', '') as produto, count(*)::int as n
         from revenue_ledger l
        where l.organization_id = $1
          and l.event_type = 'charge'
          and l.amount_cents > 0
          and l.occurred_at >= (date_trunc('month', $2::timestamptz at time zone $3) at time zone $3)
          and not exists (
            select 1 from revenue_ledger e
             where e.organization_id = l.organization_id
               and e.event_type in ('refund', 'chargeback')
               and e.external_event_id = l.external_event_id)
        group by 1`,
      [organizationId, agora.toISOString(), fuso],
    );
    const vendidos = vendidosPorProduto(rows);
    cache.set(organizationId, { em: agora.getTime(), vendidos });
    return { meta, porProduto, vendidos };
  } catch {
    return null;
  }
}

export interface LinhaDaMeta {
  produto: string;
  vendidos: number;
  meta: number;
  /** Quantas o mês fecha no ritmo de agora (vendidos ÷ dias passados × dias do mês). */
  ritmo: number;
}

/**
 * O cartão "Meta do mês" do painel: cada produto do agente com vendidos, meta e o ritmo para fechar o mês, o mais
 * atrás primeiro. `null` sem meta configurada. Pura.
 */
export function progressoDaMeta(
  produtos: readonly string[],
  vendasDoMes: readonly { notes: string | null }[],
  config: { meta_mensal_por_produto?: number; metas_por_produto?: Record<string, number> } | null | undefined,
  diaDoMes: number,
  diasNoMes: number,
): LinhaDaMeta[] | null {
  const geral = config?.meta_mensal_por_produto;
  if (!geral) return null;
  const vendidos = vendidosPorProduto(vendasDoMes.map((v) => ({ produto: v.notes, n: 1 })));
  const porProduto = new Map(Object.entries(config?.metas_por_produto ?? {}).map(([n, v]) => [chaveDoProduto(n), v] as const));
  const m: MetaDoMes = { meta: geral, vendidos, porProduto };
  return produtos
    .map((produto) => {
      const k = chaveDoProduto(produto);
      const feitos = vendidos.get(k) ?? 0;
      return {
        produto,
        vendidos: feitos,
        meta: porProduto.get(k) ?? geral,
        ritmo: Math.round((feitos / Math.max(1, diaDoMes)) * diasNoMes),
      };
    })
    .sort((a, b) => faltaParaAMeta(b.produto, m) - faltaParaAMeta(a.produto, m) || a.produto.localeCompare(b.produto));
}
