/**
 * A ABA HOJE COM HIERARQUIA (pedido do dono em 19/10/2026: "experiência do cliente, copiar e aprimorar o mercado").
 *
 * Três peças, puras (o servidor decide; a tela só desenha):
 *  - a FRASE DO DIA (o modelo Co-Star): curta, íntima, no tema que a pessoa escolheu na entrada. Sorteio fixo por
 *    pessoa e dia — a mesma frase o dia todo, outra amanhã —, de uma lista curada: nenhuma promete resultado nem
 *    usa medo, e não custa IA;
 *  - a LEMBRANÇA (o modelo Duolingo, sem culpa): a última pergunta que ela fez às cartas, de 1 a 7 dias atrás, para
 *    a área perguntar "como foi?";
 *  - o DESTAQUE ÚNICO (o modelo Netflix): uma coisa em evidência por dia, escolhida pelo momento dela. O resto fica
 *    recolhido em "Mais para hoje".
 */
import { createHash } from "node:crypto";

import type { Foco } from "./perfil";

/** Frases sem tema: valem para quem pulou a entrada e entram no sorteio de todo mundo. */
export const FRASES_GERAIS: readonly string[] = [
  "Hoje, escute mais do que explica.",
  "O que é seu não precisa de pressa.",
  "Você não precisa resolver tudo hoje. Só o próximo passo.",
  "Repare no que te dá calma. É por aí.",
  "Hoje, seja gentil com quem você foi ontem.",
  "Nem todo silêncio é distância. Às vezes é descanso.",
  "Sua intuição já sabe. Dê tempo para ela falar.",
  "Pequenas escolhas de hoje desenham o mês que vem.",
];

/** Frases por tema (o foco da entrada). */
export const FRASES_DO_FOCO: Record<Foco, readonly string[]> = {
  amor: [
    "Hoje, o amor pede presença, não prova.",
    "Quem te quer bem não te faz adivinhar.",
    "Cuide do seu coração como cuidaria do de alguém que você ama.",
    "Amor que é seu chega sem você precisar se diminuir.",
  ],
  dinheiro: [
    "Hoje, olhe para o seu dinheiro sem medo: só com atenção.",
    "Uma conta organizada também é uma forma de cuidado.",
    "Seu trabalho vale mais quando você para de pedir desculpa por ele.",
    "Prosperar começa por saber para onde o seu esforço vai.",
  ],
  familia: [
    "Hoje, escolha uma conversa leve em casa.",
    "Família também se cuida com limite.",
    "Você pode amar alguém e ainda assim precisar de distância.",
    "Um gesto pequeno em casa vale mais que um discurso.",
  ],
  saude: [
    "Hoje, beba água e respire fundo três vezes. Seu corpo agradece.",
    "Descansar também é fazer alguma coisa.",
    "Repare no que cansa você. Dá para tirar uma coisa só?",
    "Sua energia é preciosa: gaste com o que te devolve.",
  ],
  caminhos: [
    "Hoje, um passo pequeno conta mais que um plano perfeito.",
    "Quando a dúvida pesa, pergunte: qual escolha me deixa em paz?",
    "Nem toda porta fechada é perda. Algumas são proteção.",
    "Seu caminho não precisa ser igual ao de ninguém.",
  ],
  autoconhecimento: [
    "Hoje, repare no que você sente antes de reagir.",
    "Você já atravessou coisas difíceis. Lembre disso.",
    "O que você evita olhar costuma ser o que mais quer ser cuidado.",
    "Ser inteira é melhor que ser perfeita.",
  ],
};

function indice(semente: string, tamanho: number): number {
  return createHash("sha256").update(semente, "utf8").digest().readUInt32BE(0) % tamanho;
}

/** A frase de hoje desta pessoa: do tema dela (quando escolheu) ou das gerais. Fixa no dia. */
export function fraseDoDia(contactId: string, dia: string, foco: Foco | null): string {
  const lista = foco ? [...FRASES_DO_FOCO[foco], ...FRASES_GERAIS.slice(0, 2)] : FRASES_GERAIS;
  return lista[indice(`frase:${contactId}:${dia}`, lista.length)]!;
}

/** Quantos dias inteiros (no fuso da organização) separam dois dias `AAAA-MM-DD`. */
function diasEntre(deDia: string, ateDia: string): number {
  return Math.round((Date.parse(`${ateDia}T00:00:00Z`) - Date.parse(`${deDia}T00:00:00Z`)) / 86_400_000);
}

export interface Lembranca {
  pergunta: string;
  diasAtras: number;
}

/**
 * A última pergunta feita às cartas, de 1 a 7 dias atrás (hoje ela ainda está com a leitura fresca; mais de uma
 * semana, a lembrança vira cobrança). `diaDe` converte o instante no dia do fuso da organização.
 */
export function lembrancaDaMesa(
  leituras: ReadonlyArray<{ pergunta: string; quando: string; revelada: boolean }>,
  hoje: string,
  diaDe: (iso: string) => string,
): Lembranca | null {
  const ultima = [...leituras]
    .filter((l) => l.revelada && l.pergunta.trim().length > 0)
    .sort((a, b) => b.quando.localeCompare(a.quando))[0];
  if (!ultima) return null;
  const diasAtras = diasEntre(diaDe(ultima.quando), hoje);
  return diasAtras >= 1 && diasAtras <= 7 ? { pergunta: ultima.pergunta.trim(), diasAtras } : null;
}

export type DestaqueDeHoje = "aniversario" | "lembranca" | "mesa" | null;

/** O destaque único: o aniversário vence; depois a lembrança (ela já tem uma história aqui); depois a Mesa. */
export function destaqueDeHoje(d: { aniversario: boolean; lembranca: Lembranca | null; mesa: boolean }): DestaqueDeHoje {
  if (d.aniversario) return "aniversario";
  if (d.lembranca) return "lembranca";
  if (d.mesa) return "mesa";
  return null;
}
