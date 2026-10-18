/**
 * A MESA DE LEITURAS da área do cliente — as regras, sem I/O.
 *
 * Pedido do dono em 18/10/2026: a pessoa escolhe a modalidade, faz a pergunta, paga ali mesmo e vê a leitura
 * na hora (embaralha, escolhe três cartas, a leitura aparece no chat). A primeira de cada modalidade sai pelo
 * preço de entrada (R$ 5) e as seguintes pelo preço normal, ambos configuráveis.
 *
 * Três decisões que protegem quem está aflita (combinadas com o dono):
 *  - a leitura é AUTOMÁTICA e a tela diz isso; o atendimento com cigana de verdade é outro produto;
 *  - há um LIMITE de leituras por dia: R$ 5 repetível vira caça-níquel para quem manda dez perguntas sobre o
 *    mesmo homem;
 *  - as cartas são sorteadas pelo SERVIDOR na hora de revelar. A pessoa escolhe as posições na mesa (o ritual),
 *    mas não tem como escolher a carta, nem a IA.
 */
import { BARALHO } from "@/lib/leitura/baralho";

import { BARALHO_CIGANO } from "./baralho-cigano";

export const EXTRA_DA_LEITURA = "leitura";

export const MODALIDADES = ["tarot", "baralho-cigano"] as const;
export type Modalidade = (typeof MODALIDADES)[number];

export const NOME_DA_MODALIDADE: Record<Modalidade, string> = {
  tarot: "Tarot",
  "baralho-cigano": "Baralho Cigano",
};

/** Quantas cartas a mesa espalha, fechadas, para a pessoa escolher. */
export const CARTAS_NA_MESA: Record<Modalidade, number> = {
  tarot: BARALHO.length,
  "baralho-cigano": BARALHO_CIGANO.length,
};

/** As três posições da leitura, na ordem em que as cartas são viradas. */
export const POSICOES = ["O que pesa", "O que está em movimento", "O conselho das cartas"] as const;

export const PRECO_DA_PRIMEIRA_PADRAO = 500;
export const PRECO_PADRAO = 1490;
export const LIMITE_POR_DIA_PADRAO = 3;

export interface ConfigDasLeituras {
  ativo: boolean;
  preco_primeira_cents: number;
  preco_cents: number;
  limite_por_dia: number;
}

/** A carta que saiu, já com a posição. `simbolo` só no Baralho Cigano (o tarot tem foto). */
export interface CartaDaLeitura {
  id: number;
  nome: string;
  posicao: string;
  simbolo?: string;
  /** O sentido de base que a IA recebe para escrever. */
  sentido: string;
}

export function ehModalidade(v: unknown): v is Modalidade {
  return typeof v === "string" && (MODALIDADES as readonly string[]).includes(v);
}

/** O preço desta leitura: o de entrada se é a primeira PAGA da pessoa nesta modalidade, senão o normal. */
export function precoDaLeitura(cfg: Pick<ConfigDasLeituras, "preco_primeira_cents" | "preco_cents">, jaPagouNaModalidade: boolean): number {
  return jaPagouNaModalidade ? cfg.preco_cents : cfg.preco_primeira_cents;
}

/** Pode pedir mais uma leitura hoje? Conta as já PAGAS no dia (no fuso da empresa). */
export function cabeHoje(pagasHoje: number, limitePorDia: number): boolean {
  return pagasHoje < limitePorDia;
}

/**
 * Sorteia as três cartas da leitura, distintas, com a posição de cada uma. Feito no servidor, na hora de
 * revelar: as posições que a pessoa tocou na mesa não decidem a carta.
 */
export function sortearCartas(modalidade: Modalidade, aleatorio: () => number = Math.random): CartaDaLeitura[] {
  const baralho =
    modalidade === "tarot"
      ? BARALHO.map((c) => ({ id: c.id, nome: c.nome, sentido: c.sentido.geral }))
      : BARALHO_CIGANO.map((c) => ({ id: c.id, nome: c.nome, sentido: c.sentido, simbolo: c.simbolo }));
  const ids = baralho.map((_, i) => i);
  // Fisher–Yates parcial: só as três primeiras posições importam.
  for (let i = 0; i < POSICOES.length; i++) {
    const j = i + Math.floor(aleatorio() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  return POSICOES.map((posicao, i) => ({ ...baralho[ids[i]!]!, posicao }));
}

/** Lê a coluna `cartas` sem nunca lançar: formato estranho = sem cartas. */
export function lerCartas(bruto: unknown): CartaDaLeitura[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.filter(
    (c): c is CartaDaLeitura =>
      !!c && typeof c === "object" && typeof (c as CartaDaLeitura).id === "number" && typeof (c as CartaDaLeitura).nome === "string",
  );
}
