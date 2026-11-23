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
import { MARCA_DA_RAIZ } from "./raiz-registrada";
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
    "Agora una as 3 cartas numa síntese só, em português simples e como POSSIBILIDADE (\"as cartas mostram\", \"pode ser que\"), nunca como causa comprovada. Use SÓ o que ela contou: a pergunta dela, o que ela já tentou e as áreas da vida que ela mesma citou. Sono, dinheiro, relacionamento ou qualquer outra área só entram se ela falou delas; nunca presuma dificuldade nem amplie o problema. Se ela contou o que tentou, não conclua que não resolve: no máximo reconheça \"pelo que você contou, isso ainda não trouxe o alívio que você buscava\". O jeito de dizer (quantos balões, a pergunta do fim) é o do seu roteiro; sem roteiro para isso, feche perguntando se faz sentido para ela.",
    `Se ela respondeu à 3ª carta com uma dúvida ou outro assunto, responda só a isso, curto, SEM a marca: a síntese fica para a próxima resposta. A marca ${MARCA_DA_RAIZ}, no fim da mensagem, só vai na resposta que ENTREGA a síntese das 3 cartas (ela não aparece para a pessoa e diz ao sistema que esta etapa terminou).`,
  ].join("\n");
}

function blocoDaLeituraEncerrada(cartas: readonly [Carta, Carta, Carta], semEvidencia = false, reparoEsgotado = false): string {
  const nomes = cartas.map((c) => c.nome).join(", ");
  // SÍNTESE PENDENTE (releitura de 22/11/2026): o bloco antigo dizia "pode fazê-la quando couber" e, na mesma frase, mandava
  // seguir para o trabalho, o valor e o link — a leitura grátis terminava sem a síntese e a venda andava. Agora é UMA resposta
  // de reparo com a síntese primeiro; se ela também sair sem a marca, o bloco para de pedir (sem loop).
  if (semEvidencia && !reparoEsgotado) {
    return [
      "",
      "",
      `LEITURA — SÍNTESE PENDENTE (as 3 cartas já saíram: ${nomes}; a síntese delas ainda não foi entregue)`,
      `Nesta resposta, ANTES de falar de trabalho, valor ou link: una as 3 cartas numa síntese curta, como possibilidade ("as cartas mostram", "pode ser que"), usando só o que ela contou, e responda ao que ela acabou de dizer. Escreva no fim a marca ${MARCA_DA_RAIZ} (ela não aparece para a pessoa). A síntese faz parte da leitura grátis: nunca a cobre.`,
      "Se ela pediu o valor, o Pix ou disse que quer pagar, a síntese vem curta e o que ela pediu sai nesta mesma resposta, depois da síntese. Fora isso, o trabalho e o valor ficam para a próxima resposta.",
      'A leitura tem só 3 cartas. NUNCA revele outra carta nem escreva "CARTA 4".',
    ].join("\n");
  }
  return [
    "",
    "",
    semEvidencia
      ? `LEITURA — AS 3 CARTAS JÁ SAÍRAM (${nomes}). Se ainda não ligou as 3 numa síntese, pode fazê-lo quando couber, curto, e só então escreva no fim a marca ${MARCA_DA_RAIZ}.`
      : `LEITURA — JÁ TERMINOU (foram 3 cartas: ${nomes}; a causa raiz já foi dita)`,
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
      `Na resposta em que você responder a pergunta paga, escreva no fim a marca ${MARCA_DA_RAIZ} (ela não aparece para a pessoa). Se ela trouxe uma dúvida antes, responda a dúvida sem a marca.`,
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
export function blocoDaLeitura(
  passo: PassoDaLeitura | null,
  pergunta?: { nome: string; quantidade?: number } | null,
  /** O turno é uma retomada de silêncio: ela não respondeu à última fala. */
  toqueDeSilencio = false,
): string {
  if (passo === null) return "";
  if (toqueDeSilencio && aguardaRespostaDela(passo)) return blocoDaLeituraEmEspera(passo.cartas);
  if (pergunta) return blocoDaPerguntaPaga(passo, pergunta.nome, pergunta.quantidade ?? 1);
  if (passo.passo === "revelar_carta") return blocoDaCartaRevelada(passo.indice, passo.carta);
  if (passo.passo === "encerrada") return blocoDaLeituraEncerrada(passo.cartas, passo.semEvidencia === true, passo.reparoEsgotado === true);
  return blocoDaCausaRaiz(passo.cartas);
}

/**
 * A carta já revelada espera a resposta dela. Medido em 22/11/2026: a retomada de 3 minutos acordava a agente, o bloco do
 * turno dizia "revele a carta 2" (ou "faça a síntese"), e a leitura andava sozinha: carta 2 e carta 3 viradas sem uma
 * palavra dela, síntese repetida em dois toques. Na retomada, a leitura NÃO anda: só retoma a pergunta da última carta.
 * A carta 1 com os números já escolhidos é a resposta que ela espera, e sai normalmente.
 */
function aguardaRespostaDela(passo: PassoDaLeitura): boolean {
  if (passo.passo === "revelar_carta") return passo.indice > 1;
  if (passo.passo === "causa_raiz") return true;
  return passo.semEvidencia === true && passo.reparoEsgotado !== true;
}

function blocoDaLeituraEmEspera(cartas: readonly [Carta, Carta, Carta]): string {
  return [
    "",
    "",
    `LEITURA — ESPERANDO A RESPOSTA DELA (retomada de silêncio; cartas da mesa: ${cartas.map((c) => c.nome).join(", ")})`,
    "Ela ainda não respondeu à sua última pergunta. NÃO revele a próxima carta, NÃO faça a síntese e NÃO fale de trabalho nem de valor. Em UM balão curto, pelo nome, retome com outras palavras a pergunta da última carta, fácil de responder.",
  ].join("\n");
}
