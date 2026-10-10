/**
 * RESULTADO POR ANÚNCIO — o funil que o banco somou, ao lado do que a plataforma cobrou.
 *
 * A plataforma de anúncio sabe quanto gastou e quantas conversas abriu; quem sabe quem COMPROU é
 * este sistema. Juntar os dois por anúncio é o que responde a pergunta que decide verba: quanto
 * custou cada venda deste criativo.
 *
 * ─── Três regras que a tela herda daqui ─────────────────────────────────────────────────────
 *  - gasto DESCONHECIDO não vira zero. Anúncio cujo gasto não foi lido (sem conexão, sem acesso à
 *    conta, fora do teto de leituras) tem `gastoCents: null`, e custo por venda e retorno ficam
 *    nulos. "Não sei quanto custou" e "saiu de graça" são frases diferentes;
 *  - sem venda não há custo por venda: `null`, nunca infinito nem zero;
 *  - os contatos sem anúncio identificado entram numa linha própria, no fim. Escondê-los faria a
 *    soma da tela não bater com o total de vendas.
 *
 * Tudo aqui é puro.
 */

/** Uma linha de `fn_resultado_por_anuncio` (migration 0922). */
export interface FunilDoAnuncio {
  anuncio: string | null;
  titulo: string | null;
  leads: number;
  engajaram: number;
  ouviram_preco: number;
  receberam_link: number;
  compradores: number;
  compras: number;
  receita_cents: number;
}

/** O que a plataforma devolveu para um anúncio no período. */
export interface GastoDoAnuncio {
  gastoCents: number;
  impressoes: number;
  nome: string | null;
  campanha: string | null;
}

export interface LinhaDoResultado {
  anuncio: string | null;
  nome: string | null;
  campanha: string | null;
  leads: number;
  engajaram: number;
  ouviramPreco: number;
  receberamLink: number;
  compradores: number;
  compras: number;
  receitaCents: number;
  /** De cada 100 que entraram, quantos compraram. */
  conversaoPct: number;
  gastoCents: number | null;
  custoPorLeadCents: number | null;
  custoPorVendaCents: number | null;
  /** Receita ÷ gasto. `null` sem gasto conhecido. */
  retorno: number | null;
}

export interface ResultadoPorAnuncio {
  linhas: LinhaDoResultado[];
  /** Só os anúncios identificados. */
  total: LinhaDoResultado;
  /** Quantos anúncios com leads ficaram sem gasto lido. */
  semGasto: number;
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

function linha(f: FunilDoAnuncio, g: GastoDoAnuncio | undefined): LinhaDoResultado {
  const leads = n(f.leads);
  const compradores = n(f.compradores);
  const receita = n(f.receita_cents);
  const gasto = g ? Math.max(0, Math.round(g.gastoCents)) : null;
  return {
    anuncio: f.anuncio,
    nome: g?.nome ?? f.titulo ?? null,
    campanha: g?.campanha ?? null,
    leads,
    engajaram: n(f.engajaram),
    ouviramPreco: n(f.ouviram_preco),
    receberamLink: n(f.receberam_link),
    compradores,
    compras: n(f.compras),
    receitaCents: receita,
    conversaoPct: leads > 0 ? Number(((compradores / leads) * 100).toFixed(2)) : 0,
    gastoCents: gasto,
    custoPorLeadCents: gasto !== null && leads > 0 ? Math.round(gasto / leads) : null,
    custoPorVendaCents: gasto !== null && compradores > 0 ? Math.round(gasto / compradores) : null,
    retorno: gasto !== null && gasto > 0 ? Number((receita / gasto).toFixed(2)) : null,
  };
}

export function montarResultadoPorAnuncio(
  funil: readonly FunilDoAnuncio[],
  gastos: ReadonlyMap<string, GastoDoAnuncio>,
): ResultadoPorAnuncio {
  const identificados = funil.filter((f) => f.anuncio !== null && f.anuncio !== "");
  const semAnuncio = funil.filter((f) => f.anuncio === null || f.anuncio === "");

  const linhas = identificados
    .map((f) => linha(f, gastos.get(f.anuncio as string)))
    .sort((a, b) => b.leads - a.leads || b.receitaCents - a.receitaCents);

  // O total soma só o que tem gasto conhecido no gasto, e TUDO no funil: custo por venda do total
  // com gasto parcial seria um número bonito e errado, então ele só existe se nenhum ficou de fora.
  const semGasto = linhas.filter((l) => l.gastoCents === null).length;
  const soma = (campo: keyof FunilDoAnuncio) => identificados.reduce((s, f) => s + n(f[campo]), 0);
  const gastoTotal = semGasto === 0 && linhas.length > 0 ? linhas.reduce((s, l) => s + (l.gastoCents ?? 0), 0) : null;
  const total = linha(
    {
      anuncio: "total",
      titulo: null,
      leads: soma("leads"),
      engajaram: soma("engajaram"),
      ouviram_preco: soma("ouviram_preco"),
      receberam_link: soma("receberam_link"),
      compradores: soma("compradores"),
      compras: soma("compras"),
      receita_cents: soma("receita_cents"),
    },
    gastoTotal === null ? undefined : { gastoCents: gastoTotal, impressoes: 0, nome: null, campanha: null },
  );

  return {
    linhas: [...linhas, ...semAnuncio.map((f) => linha(f, undefined))],
    total,
    semGasto,
  };
}

/** Quais anúncios terão o gasto lido: os que mais trouxeram gente, até o teto. Pura. */
export function anunciosParaLerGasto(funil: readonly FunilDoAnuncio[], teto: number): string[] {
  return funil
    .filter((f) => f.anuncio !== null && f.anuncio !== "")
    .sort((a, b) => n(b.leads) - n(a.leads))
    .slice(0, teto)
    .map((f) => f.anuncio as string);
}
