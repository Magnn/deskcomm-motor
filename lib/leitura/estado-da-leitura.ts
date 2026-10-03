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
 *      raiz já foi dita, a leitura ACABOU: o passo vira `encerrada`, que só trava
 *      (sem ele o modelo seguia inventando "CARTA 4", "CARTA 5"… — medido em
 *      produção, 03/out — em vez de seguir pro trabalho).
 */
import { expandirHistoricoColado, type MensagemParaContar } from "@/lib/preco/estado-da-negociacao";

import { extrairNumerosEscolhidos, sortearCartas, type Carta } from "./sorteio";

/** O marcador que abre a mensagem de cada carta revelada. Exportado para o envio da imagem da carta. */
export const MARCA_CARTA = /^CARTA\s+([123]):/m;

/** O pedido da agente para a pessoa escolher no baralho fechado (o molde do prompt cai em qualquer um dos três). */
export const PEDIDO_DO_BARALHO = /\b22\s+cartas\b|\b1\s*(?:a|à|até)\s*22\b|\b(?:3|três)\s+números\b/i;

export type PassoDaLeitura =
  | { passo: "revelar_carta"; indice: 1 | 2 | 3; carta: Carta; cartas: readonly [Carta, Carta, Carta] }
  | { passo: "causa_raiz"; cartas: readonly [Carta, Carta, Carta] }
  | { passo: "encerrada"; cartas: readonly [Carta, Carta, Carta] };

/** `sent_at` (quando a conversa o tem) é a RODADA do sorteio: a mesma escolha, outro dia, é outra leitura. */
type Mensagem = MensagemParaContar & { sent_at?: string | null };

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
 * O passo atual da leitura PARA ESTE TURNO. `null` = não há leitura: a pessoa ainda não escolheu 3
 * números válidos DEPOIS de a agente oferecer o baralho. `encerrada` = as 3 cartas e a causa raiz
 * já saíram; o bloco só lembra que não existe carta 4.
 */
export function passoDaLeitura(contatoId: string, mensagens: readonly Mensagem[]): PassoDaLeitura | null {
  // O painel de Teste roda UMA mensagem: um histórico colado ali ("Lead: …" / "Esmeralda: …") vira
  // várias, como já vale para a escada de preço. Na produção nenhuma mensagem tem esse formato.
  const conversa = expandirHistoricoColado(mensagens) as Mensagem[];

  const pedido = conversa.findIndex((m) => m.direction === "outbound" && PEDIDO_DO_BARALHO.test(m.body ?? ""));
  if (pedido < 0) return null;

  const escolha = conversa.findIndex(
    (m, i) => i > pedido && m.direction === "inbound" && extrairNumerosEscolhidos(m.body ?? "") !== null,
  );
  if (escolha < 0) return null;

  const numeros = extrairNumerosEscolhidos(conversa[escolha]!.body ?? "")!;
  const cartas = sortearCartas(contatoId, numeros, conversa[escolha]!.sent_at ?? undefined);

  const depois = conversa.slice(escolha + 1);
  const jaReveladas = depois.filter(ehCartaRevelada).length;

  if (jaReveladas >= 3) return causaRaizJaDita(depois) ? { passo: "encerrada", cartas } : { passo: "causa_raiz", cartas };
  const indice = (jaReveladas + 1) as 1 | 2 | 3;
  return { passo: "revelar_carta", indice, carta: cartas[indice - 1]!, cartas };
}
