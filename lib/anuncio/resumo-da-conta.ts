/**
 * RESUMO DA CONTA DE ANÚNCIOS — a resposta que o dono procura ao abrir a tela: quanto gastei,
 * quanto voltou, o que está rodando e qual anúncio vende.
 *
 * Junta três fontes pelo ID, nunca pelo nome (a plataforma aceita nomes repetidos):
 *  - os anúncios que rodaram na conta no período, com a campanha e o gasto (plataforma);
 *  - o estado de cada campanha (plataforma);
 *  - o funil por anúncio — quem entrou e quem comprou (`fn_resultado_por_anuncio`, banco).
 *
 * As vendas contam só os anúncios DESTA conta. O funil de anúncio que não rodou no período (o lead
 * clicou dias antes) fica de fora: o resumo é da conta no período, e a tela de resultado por anúncio
 * segue mostrando tudo. Tudo aqui é puro.
 */
import type { FunilDoAnuncio } from "./resultado-por-anuncio";

/** Um anúncio que rodou na conta no período. */
export interface AnuncioDaConta {
  adId: string;
  nome: string | null;
  campanhaId: string | null;
  gastoCents: number;
}

export interface CampanhaDaConta {
  id: string;
  nome: string;
  /** `effective_status` da plataforma. */
  veiculacao: string | null;
  /** Orçamento diário da campanha; `null`/ausente quando o orçamento é dos conjuntos. */
  orcamentoDiarioCents?: number | null;
}

export interface NumerosDoPeriodo {
  gastoCents: number;
  receitaCents: number;
  compradores: number;
  /** Quem chegou pelos anúncios da conta. */
  conversas: number;
  /** Receita ÷ gasto; `null` sem gasto. */
  retorno: number | null;
  custoPorClienteCents: number | null;
}

export interface CampanhaRodando extends NumerosDoPeriodo {
  id: string;
  nome: string;
  veiculacao: string | null;
  orcamentoDiarioCents?: number | null;
}

/** O funil de UM anúncio da conta no período: do gasto ao Pix. */
export interface FunilNaConta {
  adId: string;
  nome: string | null;
  gastoCents: number;
  conversas: number;
  engajaram: number;
  ouviramPreco: number;
  compradores: number;
  receitaCents: number;
  retorno: number | null;
}

export interface AnuncioCampeao {
  adId: string;
  nome: string | null;
  compradores: number;
  receitaCents: number;
  gastoCents: number;
}

export interface AlertaDeCampanha {
  campanha: string;
  veiculacao: string;
}

export interface ResumoDaConta {
  atual: NumerosDoPeriodo;
  anterior: NumerosDoPeriodo;
  rodando: CampanhaRodando[];
  campeoes: AnuncioCampeao[];
  /** Todos os anúncios que gastaram no período, do que mais gastou ao que menos. */
  anuncios: FunilNaConta[];
  /** Campanhas que não rodaram nem gastaram no período. */
  paradas: number;
  alertas: AlertaDeCampanha[];
}

/** Veiculação que pede atenção de quem opera. */
const VEICULACAO_COM_ALERTA = new Set(["WITH_ISSUES", "DISAPPROVED", "PENDING_REVIEW", "IN_PROCESS", "PENDING_BILLING_INFO"]);

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};

function numeros(gastoCents: number, receitaCents: number, compradores: number, conversas: number): NumerosDoPeriodo {
  return {
    gastoCents,
    receitaCents,
    compradores,
    conversas,
    retorno: gastoCents > 0 ? Number((receitaCents / gastoCents).toFixed(2)) : null,
    custoPorClienteCents: gastoCents > 0 && compradores > 0 ? Math.round(gastoCents / compradores) : null,
  };
}

function somar(anuncios: readonly AnuncioDaConta[], funil: ReadonlyMap<string, FunilDoAnuncio>): NumerosDoPeriodo {
  let gasto = 0;
  let receita = 0;
  let compradores = 0;
  let conversas = 0;
  for (const a of anuncios) {
    gasto += a.gastoCents;
    const f = funil.get(a.adId);
    if (!f) continue;
    receita += n(f.receita_cents);
    compradores += n(f.compradores);
    conversas += n(f.leads);
  }
  return numeros(gasto, receita, compradores, conversas);
}

const porAnuncio = (funil: readonly FunilDoAnuncio[]) =>
  new Map(funil.filter((f) => f.anuncio).map((f) => [f.anuncio as string, f]));

export function montarResumoDaConta(entrada: {
  anuncios: readonly AnuncioDaConta[];
  anunciosAnteriores: readonly AnuncioDaConta[];
  funil: readonly FunilDoAnuncio[];
  funilAnterior: readonly FunilDoAnuncio[];
  campanhas: readonly CampanhaDaConta[];
}): ResumoDaConta {
  const funil = porAnuncio(entrada.funil);

  const anunciosPorCampanha = new Map<string, AnuncioDaConta[]>();
  for (const a of entrada.anuncios) {
    if (!a.campanhaId) continue;
    anunciosPorCampanha.set(a.campanhaId, [...(anunciosPorCampanha.get(a.campanhaId) ?? []), a]);
  }

  // Rodando = ativa agora, ou gastou no período (pausada ontem ainda explica o gasto da semana).
  const rodando: CampanhaRodando[] = [];
  let paradas = 0;
  for (const c of entrada.campanhas) {
    const doPeriodo = anunciosPorCampanha.get(c.id) ?? [];
    const soma = somar(doPeriodo, funil);
    if (c.veiculacao === "ACTIVE" || soma.gastoCents > 0) {
      rodando.push({ id: c.id, nome: c.nome, veiculacao: c.veiculacao, orcamentoDiarioCents: c.orcamentoDiarioCents ?? null, ...soma });
    }
    else paradas += 1;
  }
  rodando.sort((a, b) => b.gastoCents - a.gastoCents || b.receitaCents - a.receitaCents);

  const campeoes = entrada.anuncios
    .map((a) => ({ a, f: funil.get(a.adId) }))
    .filter(({ f }) => f && n(f.compradores) > 0)
    .map(({ a, f }) => ({ adId: a.adId, nome: a.nome ?? f?.titulo ?? null, compradores: n(f?.compradores), receitaCents: n(f?.receita_cents), gastoCents: a.gastoCents }))
    .sort((x, y) => y.receitaCents - x.receitaCents || y.compradores - x.compradores)
    .slice(0, 3);

  const anuncios: FunilNaConta[] = entrada.anuncios
    .filter((a) => a.gastoCents > 0)
    .map((a) => {
      const f = funil.get(a.adId);
      const receitaCents = n(f?.receita_cents);
      return {
        adId: a.adId,
        nome: a.nome ?? f?.titulo ?? null,
        gastoCents: a.gastoCents,
        conversas: n(f?.leads),
        engajaram: n(f?.engajaram),
        ouviramPreco: n(f?.ouviram_preco),
        compradores: n(f?.compradores),
        receitaCents,
        retorno: Number((receitaCents / a.gastoCents).toFixed(2)),
      };
    })
    .sort((x, y) => y.gastoCents - x.gastoCents);

  const alertas = entrada.campanhas
    .filter((c) => c.veiculacao !== null && VEICULACAO_COM_ALERTA.has(c.veiculacao))
    .map((c) => ({ campanha: c.nome, veiculacao: c.veiculacao as string }));

  return {
    atual: somar(entrada.anuncios, funil),
    anterior: somar(entrada.anunciosAnteriores, porAnuncio(entrada.funilAnterior)),
    rodando,
    campeoes,
    anuncios,
    paradas,
    alertas,
  };
}

export type Veredito = "escalar" | "segurar" | "cortar" | "pouco_dado";

/** Abaixo disto, sem venda, ainda não dá para julgar a campanha. */
export const GASTO_MINIMO_PARA_JULGAR_CENTS = 5000;

/**
 * A etiqueta de decisão. A receita só conta o que foi registrado (Pix não lido e parcelas ficam de
 * fora), então o retorno é um piso: "escalar" a partir de 2×, "cortar" abaixo de 1× (a venda não
 * paga nem o anúncio). Conta em outra moeda não ganha etiqueta: somar dólar com real mente.
 */
export function vereditoDaCampanha(c: Pick<NumerosDoPeriodo, "gastoCents" | "compradores" | "retorno">, moeda: string): Veredito | null {
  if (moeda !== "BRL") return null;
  if (c.compradores === 0 && c.gastoCents < GASTO_MINIMO_PARA_JULGAR_CENTS) return "pouco_dado";
  if (c.retorno === null) return null;
  if (c.retorno >= 2) return "escalar";
  if (c.retorno >= 1) return "segurar";
  return "cortar";
}

const DIA_MS = 24 * 60 * 60 * 1000;
const dia = (d: Date) => d.toISOString().slice(0, 10);

/** O período de mesmo tamanho que termina na véspera do início (`AAAA-MM-DD`). */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const inicio = new Date(`${de}T00:00:00Z`).getTime();
  const dias = Math.round((new Date(`${ate}T00:00:00Z`).getTime() - inicio) / DIA_MS) + 1;
  return { de: dia(new Date(inicio - dias * DIA_MS)), ate: dia(new Date(inicio - DIA_MS)) };
}
