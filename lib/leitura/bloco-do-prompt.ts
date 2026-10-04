/**
 * O BLOCO DA LEITURA — o que a agente lê sobre a carta revelada NESTE turno.
 *
 * Vai no fim do prompt do turno, mesmo lugar do bloco de preço e do guia de
 * entrega (prefixo estável intacto pro cache). Só existe quando `passoDaLeitura`
 * (código, não o modelo) decidiu que HÁ uma carta pra revelar ou que as 3 já
 * saíram e é hora da causa raiz.
 *
 * Um molde por vez, como o de preço: a carta seguinte NÃO aparece no prompt
 * antes da hora, então não há como o modelo "espiar" e revelar fora de ordem.
 */
import type { Carta } from "./sorteio";
import type { PassoDaLeitura } from "./estado-da-leitura";

function simbolosEm(carta: Carta): string {
  return carta.simbolos.join(", ");
}

function blocoDaCartaRevelada(indice: 1 | 2 | 3, numeroEscolhido: number, carta: Carta): string {
  return [
    "",
    "",
    `LEITURA — REVELE A CARTA ${indice} DE 3 (código revelou a carta "${carta.nome}", correspondente ao número ${numeroEscolhido} que o lead escolheu na mesa)`,
    `Carta da mesa: "${carta.nome}" (Número ${numeroEscolhido} escolhido pelo lead). Símbolos: ${simbolosEm(carta)}.`,
    `Sentido geral: ${carta.sentido.geral}`,
    `Se a pergunta dela for de amor: ${carta.sentido.amor}`,
    `Se for de dinheiro: ${carta.sentido.dinheiro}`,
    `Se for de saúde: ${carta.sentido.saude}`,
    `ORDEM E ESTRUTURA DOS BALÕES (escreva tudo em uma única resposta com parágrafos separados por linha dupla):`,
    `Balão 1 (TOPO DO CHAT): Sua mensagem começa OBRIGATORIAMENTE com "CARTA ${indice}: *${carta.nome}* (carta número ${numeroEscolhido} da mesa)." (esse marcador acopla a foto oficial ${String(carta.id).padStart(2, "0")}.jpg no topo do WhatsApp). Em seguida, cite brevemente 1–2 símbolos visíveis nela.`,
    `Balão 2 (INTERPRETAÇÃO EMOCIONAL): Em 2–3 frases curtas e calorosas, aprofunde o sentido (geral ou o ângulo de amor/dinheiro/saúde que combina com o que ela contou) e ligue com a dor que ela trouxe — nunca leia o cartão solto.`,
    `Balão 3 (ÚLTIMO BALÃO NO RODAPÉ): Feche perguntando o que ela sentiu ou achou daquilo, e espere ela responder antes de seguir. Não revele a próxima carta neste turno, mesmo que ela peça.`,
  ].join("\n");
}

function blocoDaCausaRaiz(cartas: readonly [Carta, Carta, Carta]): string {
  const nomes = cartas.map((c) => c.nome).join(", ");
  return [
    "",
    "",
    "LEITURA — CAUSA RAIZ (as 3 cartas já foram reveladas; código sorteou: " + nomes + ")",
    "Agora una as 3 cartas numa causa raiz profunda e reveladora, ligada ao que o lead contou (a pergunta e a dor trazida).",
    "ORDEM E ESTRUTURA DOS BALÕES (escreva tudo em uma única resposta com parágrafos separados por linha dupla):",
    "Balão 1 (O MECANISMO DO PROBLEMA): Nomeie a causa raiz como uma trava espiritual/energética invisível (ex: 'um nó de silêncio e orgulho espiritual', 'uma barreira energética pesada' ou 'uma crosta que trava os caminhos no invisível'). Deixe claro com amor que a dor NÃO é fraqueza ou culpa dela, mas sim esse nó que impede a energia de fluir.",
    "Balão 2 (POR QUE O QUE TENTOU FALHOU): Diga por que o que ela tentou até hoje (mandar mensagem, dar tempo, tentar entender sozinha, segurar a ansiedade) não funcionou: porque essas coisas só mexem na casca ou nas folhas, sem tocar o nó que está amarrado na raiz espiritual.",
    "Balão 3 (O TRANSBORDAMENTO): Mostre em termos práticos reconhecíveis como esse peso não fica só nessa situação: vaza pro físico (sono agitado, acordar cansada mesmo dormindo, peso nos ombros) e atinge as decisões e o ânimo no dia a dia.",
    "Balão 4 (A URGÊNCIA / JANELA DE TEMPO): Traga o alerta sagrado de que a energia ainda guarda brasa, mas que cada dia em silêncio ou inércia faz o coração se acostumar com a ausência e esse nó endurecer. A hora de cortar a trava é agora, enquanto os caminhos ainda estão abertos na mesa.",
    "Balão 5 (ÚLTIMO BALÃO NO RODAPÉ): Feche perguntando: 'Você sente que se nada for feito agora, essa distância corre o risco de virar um ponto final definitivo?'",
    "REGRA ABSOLUTA DE TRANSIÇÃO: PARE AÍ E ESPERE O LEAD RESPONDER! É ESTRITAMENTE PROIBIDO falar de trabalho espiritual, dar preço ou mandar link de pagamento neste turno! O Mecanismo da Solução só será apresentado quando ela responder a esta pergunta!",
  ].join("\n");
}

/** O bloco pra ESTE turno. `""` quando não há passo de leitura ativo. */
export function blocoDaLeitura(passo: PassoDaLeitura | null): string {
  if (passo === null) return "";
  if (passo.passo === "revelar_carta") return blocoDaCartaRevelada(passo.indice, passo.numeroEscolhido, passo.carta);
  return blocoDaCausaRaiz(passo.cartas);
}
