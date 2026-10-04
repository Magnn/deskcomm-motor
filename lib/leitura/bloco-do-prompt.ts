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
    "Agora una as 3 cartas numa causa raiz só, em português simples, ligada ao que ela contou (a pergunta dela e o que ela já tentou fazer, se ela disse).",
    "ORDEM E ESTRUTURA DOS BALÕES:",
    "Balão 1: Nomeie a causa raiz sem jargão de tarot e diga por que o que ela já tentou (ou pensou em tentar) não resolve — porque não toca a causa raiz, só o sintoma.",
    "Balão 2: Estenda em UMA frase pra saúde, UMA pra dinheiro e UMA pra relacionamento, com um exemplo prático do dia a dia em cada uma (não invente detalhe específico da vida dela — fale em termos gerais reconhecíveis, tipo \"muita gente nessa fase começa a dormir mal\" ou \"é comum começar a adiar contas por cansaço\").",
    "Balão 3 (ÚLTIMO BALÃO NO RODAPÉ): Feche perguntando se faz sentido pra ela, e espere a resposta antes de seguir para o trabalho espiritual certo (escolha UM, pela área da dor, como o resto destas instruções já explica) e a oferta.",
  ].join("\n");
}

/** O bloco pra ESTE turno. `""` quando não há passo de leitura ativo. */
export function blocoDaLeitura(passo: PassoDaLeitura | null): string {
  if (passo === null) return "";
  if (passo.passo === "revelar_carta") return blocoDaCartaRevelada(passo.indice, passo.numeroEscolhido, passo.carta);
  return blocoDaCausaRaiz(passo.cartas);
}
