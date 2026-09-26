/**
 * EM QUE PASSO DA LEITURA A CONVERSA ESTÁ — contado pelo código, mesmo padrão
 * de `lib/preco/estado-da-negociacao.ts`: o modelo pequeno não guarda estado
 * multi-turno de forma confiável (medido lá com a escada de preço; aqui o
 * risco é pior — "qual das 3 cartas eu já revelei" tem 4 respostas possíveis
 * e o modelo pode repetir uma carta ou pular outra).
 *
 * O código faz quatro coisas que o modelo não pode fazer sozinho:
 *   1. só considera a escolha DEPOIS de a agente oferecer o baralho fechado
 *      (uma mensagem dela com "22 cartas", "1 a 22" ou "3 números"). Três
 *      números soltos antes disso — "tenho 3 filhos, há 10 anos, dia 15" — não
 *      são escolha nenhuma e não disparam o sorteio;
 *   2. acha os 3 números que a pessoa escolheu (a primeira mensagem dela, depois
 *      do pedido, com exatamente 3 números do baralho);
 *   3. sorteia as 3 cartas de verdade a partir deles (`sortearCartas`);
 *   4. conta quantas a agente JÁ revelou (procurando o marcador "CARTA N:" nas
 *      próprias mensagens depois da escolha), pra saber se o próximo passo é
 *      revelar a carta 1, 2, 3, ou já passou pra causa raiz — e quando a causa
 *      raiz já foi dita, a leitura acabou e o bloco some (sem isto ele voltava a
 *      cada turno e a agente repetia a causa raiz em vez de seguir pro trabalho).
 */
import { expandirHistoricoColado, type MensagemParaContar } from "@/lib/preco/estado-da-negociacao";

import { extrairNumerosEscolhidos, sortearCartas, type Carta } from "./sorteio";

const MARCA_CARTA = /^CARTA\s+([123]):/m;

/** O pedido da agente para a pessoa escolher no baralho fechado (o molde do prompt cai em qualquer um dos três). */
const PEDIDO_DO_BARALHO = /\b22\s+cartas\b|\b1\s*(?:a|à|até)\s*22\b|\b(?:3|três)\s+números\b/i;

export type PassoDaLeitura =
  | { passo: "revelar_carta"; indice: 1 | 2 | 3; carta: Carta; cartas: readonly [Carta, Carta, Carta] }
  | { passo: "causa_raiz"; cartas: readonly [Carta, Carta, Carta] };

const ehCartaRevelada = (m: MensagemParaContar): boolean =>
  m.direction === "outbound" && MARCA_CARTA.test(m.body ?? "");

/**
 * A causa raiz já foi dita? É quando, DEPOIS da última carta revelada, a pessoa respondeu e a
 * agente respondeu de novo. Bolhas do mesmo turno (várias mensagens da agente seguidas, sem a
 * pessoa no meio) não contam: a resposta à 3ª carta é justamente o turno da causa raiz.
 */
function causaRaizJaDita(depoisDaEscolha: readonly MensagemParaContar[]): boolean {
  let ultimaCarta = -1;
  depoisDaEscolha.forEach((m, i) => {
    if (ehCartaRevelada(m)) ultimaCarta = i;
  });
  const resposta = depoisDaEscolha.findIndex((m, i) => i > ultimaCarta && m.direction === "inbound");
  if (resposta < 0) return false;
  return depoisDaEscolha.some((m, i) => i > resposta && m.direction === "outbound");
}

/**
 * O passo atual da leitura PARA ESTE TURNO. `null` = não há passo: a pessoa ainda não escolheu 3
 * números válidos DEPOIS de a agente oferecer o baralho, ou a leitura já terminou — o turno segue
 * sem bloco de leitura.
 */
export function passoDaLeitura(contatoId: string, mensagens: readonly MensagemParaContar[]): PassoDaLeitura | null {
  // O painel de Teste roda UMA mensagem: um histórico colado ali ("Lead: …" / "Esmeralda: …") vira
  // várias, como já vale para a escada de preço. Na produção nenhuma mensagem tem esse formato.
  const conversa = expandirHistoricoColado(mensagens);

  const pedido = conversa.findIndex((m) => m.direction === "outbound" && PEDIDO_DO_BARALHO.test(m.body ?? ""));
  if (pedido < 0) return null;

  const escolha = conversa.findIndex(
    (m, i) => i > pedido && m.direction === "inbound" && extrairNumerosEscolhidos(m.body ?? "") !== null,
  );
  if (escolha < 0) return null;

  const numeros = extrairNumerosEscolhidos(conversa[escolha]!.body ?? "")!;
  const cartas = sortearCartas(contatoId, numeros);

  const depois = conversa.slice(escolha + 1);
  const jaReveladas = depois.filter(ehCartaRevelada).length;

  if (jaReveladas >= 3) return causaRaizJaDita(depois) ? null : { passo: "causa_raiz", cartas };
  const indice = (jaReveladas + 1) as 1 | 2 | 3;
  return { passo: "revelar_carta", indice, carta: cartas[indice - 1]!, cartas };
}
