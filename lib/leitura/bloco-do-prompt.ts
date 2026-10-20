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

function blocoDaCartaRevelada(indice: 1 | 2 | 3, carta: Carta): string {
  return [
    "",
    "",
    `LEITURA — REVELE A CARTA ${indice} DE 3 (código sorteou de verdade; use exatamente esta carta, nesta ordem)`,
    `Carta sorteada: "${carta.nome}". Símbolos: ${simbolosEm(carta)}.`,
    `Sentido geral: ${carta.sentido.geral}`,
    `Se a pergunta dela for de amor: ${carta.sentido.amor}`,
    `Se for de dinheiro: ${carta.sentido.dinheiro}`,
    `Se for de saúde: ${carta.sentido.saude}`,
    `Sua mensagem começa EXATAMENTE com "CARTA ${indice}: ${carta.nome}" (uma linha só, esse marcador). Depois, em 2–3 frases curtas: descreva 1–2 símbolos da carta, escolha o sentido (geral ou o ângulo que combina com o que ela contou) e ligue com a pergunta ou situação que ela trouxe — nunca leia o cartão inteiro solto. Feche perguntando o que ela sentiu ou achou daquilo, e espere ela responder antes de seguir. Não revele a próxima carta neste turno, mesmo que ela peça.`,
  ].join("\n");
}

function blocoDaCausaRaiz(cartas: readonly [Carta, Carta, Carta]): string {
  const nomes = cartas.map((c) => c.nome).join(", ");
  return [
    "",
    "",
    "LEITURA — CAUSA RAIZ (as 3 cartas já foram reveladas; código sorteou: " + nomes + ")",
    "Agora una as 3 cartas numa causa raiz só, em português simples, ligada ao que ela contou (a pergunta dela e o que ela já tentou fazer, se ela disse). Uma mensagem, algumas frases: (1) nomeie a causa raiz sem jargão de tarot; (2) diga por que o que ela já tentou (ou pensou em tentar) não resolve — porque não toca a causa raiz, só o sintoma; (3) estenda em UMA frase pra saúde, UMA pra dinheiro e UMA pra relacionamento, com um exemplo prático do dia a dia em cada uma (não invente detalhe específico da vida dela — fale em termos gerais reconhecíveis, tipo \"muita gente nessa fase começa a dormir mal\" ou \"é comum começar a adiar contas por cansaço\"). Feche perguntando se faz sentido pra ela, e espere a resposta antes de seguir para o trabalho espiritual certo (escolha UM, pela área da dor, como o resto destas instruções já explica) e a oferta.",
  ].join("\n");
}

function blocoDaLeituraEncerrada(cartas: readonly [Carta, Carta, Carta]): string {
  const nomes = cartas.map((c) => c.nome).join(", ");
  return [
    "",
    "",
    `LEITURA — JÁ TERMINOU (foram 3 cartas: ${nomes}; a causa raiz já foi dita)`,
    'A leitura tem só 3 cartas. NUNCA revele outra carta, nunca escreva "CARTA 4" nem ofereça "a próxima camada" ou "a próxima carta". Se ela pedir mais cartas, diga que a leitura dela foi dessas 3 e retome o que elas mostraram. Siga o roteiro a partir daqui: o trabalho certo para a dor dela, o valor e o link, conforme estas instruções.',
  ].join("\n");
}

/**
 * Como a resposta paga fala da OUTRA pessoa. Decisão do dono em 20/10/2026: quem paga a pergunta quer saber dela, e
 * quem fala é o tarô — a resposta pode dizer o que as cartas mostram sobre o outro, sempre como leitura das cartas,
 * nunca como certeza nem como promessa de volta, resultado ou data.
 */
const SOBRE_A_OUTRA_PESSOA =
  'Se a pergunta for sobre outra pessoa, diga o que as CARTAS mostram dela ("as cartas mostram que ele…", "aqui aparece nele…"): o momento dela, o que ela tende a sentir e a fazer. É a leitura das cartas, não uma certeza: não afirme como fato, não prometa volta, resultado nem data.';

/** A pergunta paga: o mesmo formato das cartas (com a foto), e no fim a resposta à pergunta, não o trabalho. */
function blocoDaPerguntaPaga(passo: PassoDaLeitura, nome: string, quantidade = 1): string {
  const nomes = passo.cartas.map((c) => c.nome).join(", ");
  if (passo.passo === "revelar_carta") {
    return (
      blocoDaCartaRevelada(passo.indice, passo.carta).replace(
        "LEITURA — REVELE A CARTA",
        `PERGUNTA PAGA (*${nome}*) — REVELE A CARTA`,
      ) +
      `\nEsta leitura é a pergunta que ela PAGOU: use este formato "CARTA ${passo.indice}:" (o sistema manda a foto da carta), mesmo que o roteiro diga que esse formato é só da leitura gratuita. Ligue a carta à pergunta paga.`
    );
  }
  if (passo.passo === "causa_raiz") {
    return [
      "",
      "",
      `PERGUNTA PAGA (*${nome}*${quantidade > 1 ? `, ${quantidade} perguntas` : ""}) — A RESPOSTA (as 3 cartas já foram reveladas: ${nomes})`,
      quantidade > 1
        ? `Ela pagou ${quantidade} perguntas, e as 3 cartas são a mesa de todas elas. Responda AS ${quantidade}, uma por uma, na ordem em que ela listou, cada uma em 1 ou 2 balões curtos começando pela pergunta ("Sobre [a pergunta]: …"): o que as cartas mostram para ela e uma orientação prática. Fale em português simples e em tendência.`
        : "Agora una as 3 cartas e RESPONDA a pergunta que ela pagou, em 2 a 4 balões curtos, em português simples: o que as cartas mostram para essa pergunta e uma orientação prática para os próximos dias. Fale em tendência.",
      SOBRE_A_OUTRA_PESSOA,
      "Depois da resposta, num balão final, SUGIRA UMA pergunta nova que nasce do que as cartas mostraram e que ela vai querer saber (curiosidade, nunca medo), e pergunte se ela quer que você abra a mesa pra ela. Não mande cobrança neste turno: só se ela disser que quer.",
    ].join("\n");
  }
  return [
    "",
    "",
    `PERGUNTA PAGA (*${nome}*) — JÁ RESPONDIDA (cartas: ${nomes})`,
    'A pergunta que ela pagou já foi respondida com estas 3 cartas. NÃO revele outra carta. Se ela quiser perguntar outra coisa às cartas, é uma pergunta NOVA: cobre de novo, como está em COBRANÇAS À PARTE.',
  ].join("\n");
}

/**
 * O bloco pra ESTE turno. `""` quando não há leitura na conversa. `pergunta`: esta é a rodada de uma pergunta
 * PAGA (`perguntaPagaRecente`), com o nome da cobrança.
 */
export function blocoDaLeitura(passo: PassoDaLeitura | null, pergunta?: { nome: string; quantidade?: number } | null): string {
  if (passo === null) return "";
  if (pergunta) return blocoDaPerguntaPaga(passo, pergunta.nome, pergunta.quantidade ?? 1);
  if (passo.passo === "revelar_carta") return blocoDaCartaRevelada(passo.indice, passo.carta);
  if (passo.passo === "encerrada") return blocoDaLeituraEncerrada(passo.cartas);
  return blocoDaCausaRaiz(passo.cartas);
}
