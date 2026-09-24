/**
 * EM QUE PASSO DA LEITURA A CONVERSA ESTÁ — contado pelo código, mesmo padrão
 * de `lib/preco/estado-da-negociacao.ts`: o modelo pequeno não guarda estado
 * multi-turno de forma confiável (medido lá com a escada de preço; aqui o
 * risco é pior — "qual das 3 cartas eu já revelei" tem 4 respostas possíveis
 * e o modelo pode repetir uma carta ou pular outra).
 *
 * O código faz três coisas que o modelo não pode fazer sozinho:
 *   1. acha os 3 números que a pessoa escolheu no baralho fechado (a primeira
 *      mensagem dela, na janela, com exatamente 3 números do baralho);
 *   2. sorteia as 3 cartas de verdade a partir deles (`sortearCartas`);
 *   3. conta quantas a agente JÁ revelou (procurando o marcador "CARTA N:" nas
 *      próprias mensagens), pra saber se o próximo passo é revelar a carta 1,
 *      2, 3, ou já passou pra causa raiz.
 */
import type { MensagemParaContar } from "@/lib/preco/estado-da-negociacao";

import { extrairNumerosEscolhidos, sortearCartas, type Carta } from "./sorteio";

const MARCA_CARTA = /^CARTA\s+([123]):/m;

export type PassoDaLeitura =
  | { passo: "revelar_carta"; indice: 1 | 2 | 3; carta: Carta; cartas: readonly [Carta, Carta, Carta] }
  | { passo: "causa_raiz"; cartas: readonly [Carta, Carta, Carta] };

/**
 * O passo atual da leitura PARA ESTE TURNO. `null` = a pessoa ainda não
 * escolheu 3 números válidos nesta janela — o turno segue sem bloco de leitura.
 */
export function passoDaLeitura(contatoId: string, mensagens: readonly MensagemParaContar[]): PassoDaLeitura | null {
  const primeiraEscolha = mensagens.find(
    (m) => m.direction === "inbound" && extrairNumerosEscolhidos(m.body ?? "") !== null,
  );
  if (!primeiraEscolha) return null;

  const numeros = extrairNumerosEscolhidos(primeiraEscolha.body ?? "")!;
  const cartas = sortearCartas(contatoId, numeros);

  const jaReveladas = mensagens.filter(
    (m) => m.direction === "outbound" && MARCA_CARTA.test(m.body ?? ""),
  ).length;

  if (jaReveladas >= 3) return { passo: "causa_raiz", cartas };
  const indice = (jaReveladas + 1) as 1 | 2 | 3;
  return { passo: "revelar_carta", indice, carta: cartas[indice - 1]!, cartas };
}
