/**
 * A LEITURA DO MAPA ASTRAL (migration 0959) — a parte paga em cima do mapa grátis (`_mapa.tsx`, PR #494).
 *
 * O caminho, no molde da leitura da mão (`mao.ts`): com o mapa calculado no servidor, a IA escreve o que dizem o
 * Sol, a Lua, o Ascendente (só com a hora), Vênus e Marte, cada um no signo e na casa em que caiu, mais uma síntese
 * e um passo. O SOL abre de graça na hora; os outros mostram só a posição (o que o céu marca, calculado, não
 * escrito pela IA), e a leitura deles, a síntese e o passo abrem com créditos, Pix ou cartão.
 *
 * Mapa é retrato de temperamento, nunca destino: nada de previsão de morte, doença, acidente ou separação.
 *
 * Pura.
 */
import type { MapaNatal } from "@/lib/relatorio/mapa-natal";

export const EXTRA_DA_LEITURA_DO_MAPA = "leitura-do-mapa";

export const PARTES_DO_MAPA = ["sol", "lua", "ascendente", "venus", "marte"] as const;
export type ParteDoMapa = (typeof PARTES_DO_MAPA)[number];

/** A parte que sai de graça, antes de cobrar. */
export const PARTE_GRATIS: ParteDoMapa = "sol";

/** Quantas leituras do mapa uma pessoa pode pedir por dia: cada uma é uma chamada de IA paga por nós. */
export const LEITURAS_DO_MAPA_POR_DIA = 3;

/** O que cada parte fala, para o pedido à IA (a tela tem os seus textos traduzidos). */
export const TEMA_DA_PARTE: Record<ParteDoMapa, string> = {
  sol: "a essência, o jeito de brilhar e o que dá sentido à vida",
  lua: "as emoções, o que acalma e o que ela precisa para se sentir segura",
  ascendente: "o jeito de chegar, a primeira impressão e o caminho de crescimento",
  venus: "o amor, o afeto, o que ela valoriza e como gosta de ser amada",
  marte: "a coragem, o desejo e o jeito de agir e de brigar pelo que quer",
};

/** Onde a parte caiu no mapa: signo (em português, a chave dos nomes da tela) e casa (sem hora, nula). */
export interface PosicaoDaParte {
  parte: ParteDoMapa;
  signo: string;
  grau: number;
  casa: number | null;
}

export interface LeituraDaParte extends PosicaoDaParte {
  leitura: string;
}

export interface LeituraDoMapa {
  partes: LeituraDaParte[];
  sintese: string;
  passo: string;
}

export interface ConfigDaLeituraDoMapa {
  ativo: boolean;
  preco_cents: number;
}

/** Ligada pela empresa no painel ("Leitura do mapa astral"); precisa da tabela da 0959. Sem preço, R$ 19. */
export function configDaLeituraDoMapa(c: { ativo?: boolean; preco_cents?: number } | undefined): ConfigDaLeituraDoMapa {
  return { ativo: c?.ativo ?? false, preco_cents: c?.preco_cents ?? 1900 };
}

const PLANETA_DA_PARTE: Partial<Record<ParteDoMapa, string>> = { sol: "Sol", lua: "Lua", venus: "Vênus", marte: "Marte" };

/** As posições que a leitura vai cobrir, tiradas do mapa calculado. Sem a hora, o Ascendente fica de fora. */
export function posicoesDoMapa(mapa: MapaNatal): PosicaoDaParte[] {
  const out: PosicaoDaParte[] = [];
  for (const parte of PARTES_DO_MAPA) {
    if (parte === "ascendente") {
      if (mapa.ascendente) out.push({ parte, signo: mapa.ascendente.signo, grau: Math.floor(mapa.ascendente.grau), casa: 1 });
      continue;
    }
    const p = mapa.planetas.find((x) => x.nome === PLANETA_DA_PARTE[parte]);
    if (p) out.push({ parte, signo: p.signo, grau: Math.floor(p.grau), casa: p.casa });
  }
  return out;
}

const texto = (v: unknown, teto: number): string => (typeof v === "string" ? v.trim().slice(0, teto) : "");

/**
 * Lê a resposta da IA. As posições vêm do cálculo, nunca da IA: ela só escreve a leitura de cada parte pedida.
 * `null` quando a resposta não serve (JSON quebrado, parte faltando).
 */
export function lerLeituraDoMapa(bruto: string, posicoes: readonly PosicaoDaParte[]): LeituraDoMapa | null {
  const inicio = bruto.indexOf("{");
  const fim = bruto.lastIndexOf("}");
  if (inicio < 0 || fim <= inicio) return null;
  let j: { partes?: unknown; sintese?: unknown; passo?: unknown };
  try {
    j = JSON.parse(bruto.slice(inicio, fim + 1)) as typeof j;
  } catch {
    return null;
  }
  if (!j.partes || typeof j.partes !== "object") return null;
  const brutas = j.partes as Record<string, unknown>;
  const partes: LeituraDaParte[] = [];
  for (const pos of posicoes) {
    const b = brutas[pos.parte];
    const leitura = texto(typeof b === "object" && b ? (b as { leitura?: unknown }).leitura : b, 2000);
    if (!leitura) return null;
    partes.push({ ...pos, leitura });
  }
  const sintese = texto(j.sintese, 2000);
  const passo = texto(j.passo, 600);
  if (!sintese || !passo || partes.length === 0) return null;
  return { partes, sintese, passo };
}

export interface LeituraDoMapaNaTela {
  partes: Array<PosicaoDaParte & { leitura: string | null }>;
  sintese: string | null;
  passo: string | null;
}

/** O que vai à tela: inteira se paga; senão o Sol inteiro e, nas outras, só a posição, com a leitura fechada. */
export function leituraDoMapaNaTela(l: LeituraDoMapa, paga: boolean): LeituraDoMapaNaTela {
  return {
    partes: l.partes.map((x) => (paga || x.parte === PARTE_GRATIS ? x : { parte: x.parte, signo: x.signo, grau: x.grau, casa: x.casa, leitura: null })),
    sintese: paga ? l.sintese : null,
    passo: paga ? l.passo : null,
  };
}
