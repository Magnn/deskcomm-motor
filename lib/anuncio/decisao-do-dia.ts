/**
 * DECISÃO DO DIA — a primeira coisa do painel de tráfego: UMA frase sobre a campanha que mais gasta,
 * com a ação que ela pede (subir 20%, pausar, esperar ou manter) e o porquê em números.
 *
 * A regra é a de quem opera tráfego com venda por conversa:
 *  - mexeu no orçamento há menos de 3 dias → ESPERAR: a Meta ainda está reaprendendo, e ler antes
 *    disso é ler ruído;
 *  - 3+ compras e cada R$ 1 voltou R$ 2,50 ou mais → SUBIR 20% (o teto de uma subida, ver
 *    `SUBIDA_MAXIMA`);
 *  - a venda não paga o anúncio (veredito "cortar") → PAUSAR;
 *  - o resto → MANTER, dizendo o que falta (dado, ou retorno).
 *
 * A receita é a registrada no CRM, então o retorno é um PISO (ver `vereditoDaCampanha`). Puro.
 */
import { SUBIDA_MAXIMA } from "@/lib/plataformas-de-anuncio/meta/veiculacao-da-campanha";

import { vereditoDaCampanha, type CampanhaRodando, type Veredito } from "./resumo-da-conta";

export const RETORNO_PARA_SUBIR = 2.5;
export const COMPRAS_PARA_SUBIR = 3;
export const DIAS_DE_APRENDIZADO = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

/** Uma mudança feita pelo painel (vem do audit log). */
export interface MudancaNaCampanha {
  campanhaId: string;
  quando: string;
  tipo: "orcamento" | "veiculacao";
  antesCents?: number | null;
  depoisCents?: number | null;
  status?: string | null;
}

export type TipoDeDecisao = "subir" | "pausar" | "esperar" | "manter" | "sem_campanha";

export interface DecisaoDoDia {
  tipo: TipoDeDecisao;
  campanhaId: string | null;
  campanha: string | null;
  veredito: Veredito | null;
  gastoCents: number;
  receitaCents: number;
  compradores: number;
  retorno: number | null;
  /** Orçamento diário da campanha; `null` quando o orçamento mora nos conjuntos. */
  orcamentoCents: number | null;
  /** Para "subir": o novo orçamento, em reais inteiros, dentro do teto de 20%. */
  novoOrcamentoCents: number | null;
  /** Para "esperar": a partir de quando a leitura vale. */
  lerEm: string | null;
}

/** +20%, arredondado PARA BAIXO ao real inteiro — nunca passa do teto que a rota aceita. */
export function subidaDe(orcamentoCents: number): number {
  return Math.floor((orcamentoCents * (1 + SUBIDA_MAXIMA)) / 100) * 100;
}

export function decisaoDoDia(entrada: {
  rodando: readonly CampanhaRodando[];
  mudancas: readonly MudancaNaCampanha[];
  moeda: string;
  agora?: Date;
}): DecisaoDoDia {
  const agora = entrada.agora ?? new Date();
  const ativas = entrada.rodando.filter((c) => c.veiculacao === "ACTIVE");
  const principal = [...ativas].sort((a, b) => b.gastoCents - a.gastoCents)[0];
  if (!principal) {
    return {
      tipo: "sem_campanha", campanhaId: null, campanha: null, veredito: null, gastoCents: 0, receitaCents: 0,
      compradores: 0, retorno: null, orcamentoCents: null, novoOrcamentoCents: null, lerEm: null,
    };
  }

  const base = {
    campanhaId: principal.id,
    campanha: principal.nome,
    veredito: vereditoDaCampanha(principal, entrada.moeda),
    gastoCents: principal.gastoCents,
    receitaCents: principal.receitaCents,
    compradores: principal.compradores,
    retorno: principal.retorno,
    orcamentoCents: principal.orcamentoDiarioCents ?? null,
    novoOrcamentoCents: null,
    lerEm: null,
  };

  const ultimaDoOrcamento = entrada.mudancas
    .filter((m) => m.campanhaId === principal.id && m.tipo === "orcamento")
    .map((m) => new Date(m.quando).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (ultimaDoOrcamento !== undefined && agora.getTime() - ultimaDoOrcamento < DIAS_DE_APRENDIZADO * DIA_MS) {
    return { ...base, tipo: "esperar", lerEm: new Date(ultimaDoOrcamento + DIAS_DE_APRENDIZADO * DIA_MS).toISOString() };
  }

  if (base.veredito === "cortar") return { ...base, tipo: "pausar" };
  if (
    base.veredito === "escalar" &&
    principal.compradores >= COMPRAS_PARA_SUBIR &&
    principal.retorno !== null &&
    principal.retorno >= RETORNO_PARA_SUBIR
  ) {
    return { ...base, tipo: "subir", novoOrcamentoCents: base.orcamentoCents === null ? null : subidaDe(base.orcamentoCents) };
  }
  return { ...base, tipo: "manter" };
}
