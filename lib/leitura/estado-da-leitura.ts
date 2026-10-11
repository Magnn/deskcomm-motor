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

import { extrairNumerosEscolhidos, numerosNaMensagem, sortearCartas, type Carta } from "./sorteio";

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
 * A escolha dos 3 números depois do pedido do baralho — numa mensagem só, ou somando respostas curtas
 * ("7", depois "10", depois "19"). Só entra na soma a mensagem que é SÓ números: "tenho 2 filhos" no
 * meio não vira carta. `escolha` é o índice da mensagem que COMPLETOU os três — é o instante dela que
 * fixa a rodada do sorteio.
 */
function escolhaDepoisDoPedido(
  conversa: readonly Mensagem[],
  pedido: number,
): { escolha: number; numeros: readonly [number, number, number] } | null {
  const somados: number[] = [];
  for (let i = pedido + 1; i < conversa.length; i++) {
    const m = conversa[i]!;
    if (m.direction !== "inbound") continue;
    const deUmaVez = extrairNumerosEscolhidos(m.body ?? "");
    if (deUmaVez !== null) return { escolha: i, numeros: deUmaVez };
    const lido = numerosNaMensagem(m.body ?? "");
    if (!lido.soNumeros) continue;
    for (const n of lido.numeros) if (!somados.includes(n)) somados.push(n);
    if (somados.length >= 3) return { escolha: i, numeros: [somados[0]!, somados[1]!, somados[2]!] };
  }
  return null;
}

/**
 * A agente só revela a carta que o CÓDIGO sorteou, na ordem. `null` = pode enviar. Texto = o que dizer ao
 * modelo no lugar do envio. Sem isto, quando a escolha não era reconhecida o modelo abria "CARTA 1:" com
 * uma carta inventada, sem a foto (medido em produção em 11/10/2026: uma em cada quatro revelações).
 */
export function recusaDaCartaForaDoSorteio(corpo: string, passo: PassoDaLeitura | null): string | null {
  const marca = MARCA_CARTA.exec(corpo);
  if (!marca) return null;
  const pedida = Number(marca[1]);
  if (passo === null) {
    return (
      "A pessoa ainda não escolheu 3 números válidos de 1 a 22, então não há carta sorteada: NÃO revele carta agora. " +
      "Diga com leveza quais números você já recebeu (se recebeu algum) e peça os que faltam, de 1 a 22, sem repetir. " +
      "Se ela pedir para você escolher, peça que diga 3 números quaisquer de 1 a 22."
    );
  }
  if (passo.passo !== "revelar_carta") {
    return "As 3 cartas desta leitura já foram reveladas. NÃO revele outra carta: siga para o passo seguinte do atendimento.";
  }
  if (pedida !== passo.indice) {
    return `A carta a revelar agora é a CARTA ${passo.indice} ("${passo.carta.nome}"), e só ela. Reescreva começando por "CARTA ${passo.indice}: ${passo.carta.nome}".`;
  }
  return null;
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

  const achada = escolhaDepoisDoPedido(conversa, pedido);
  if (achada === null) return null;
  const { escolha, numeros } = achada;
  const cartas = sortearCartas(contatoId, numeros, conversa[escolha]!.sent_at ?? undefined);

  const depois = conversa.slice(escolha + 1);
  const jaReveladas = depois.filter(ehCartaRevelada).length;

  if (jaReveladas >= 3) return causaRaizJaDita(depois) ? { passo: "encerrada", cartas } : { passo: "causa_raiz", cartas };
  const indice = (jaReveladas + 1) as 1 | 2 | 3;
  return { passo: "revelar_carta", indice, carta: cartas[indice - 1]!, cartas };
}
