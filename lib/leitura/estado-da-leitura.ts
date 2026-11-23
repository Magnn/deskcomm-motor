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

import { REGISTRO_DA_RAIZ_DESDE } from "./raiz-registrada";
import { extrairNumerosEscolhidos, numerosNaMensagem, sortearCartas, type Carta } from "./sorteio";

/** O marcador que abre a mensagem de cada carta revelada. Exportado para o envio da imagem da carta. */
export const MARCA_CARTA = /^CARTA\s+([123]):/m;

/** A agente interpretando "as cartas" — o que só pode vir depois de a carta sorteada sair no formato `CARTA N:`. */
export const LEITURA_SEM_CARTA =
  /\b(?:as|a|essas?|estas?|suas?)\s+cartas?\s+(?:mostra|mostram|diz|dizem|fala|falam|revela|revelam|aponta|apontam|indica|indicam|trazem|traz)\b|\bo\s+que\s+as\s+cartas\b/i;

/** O pedido da agente para a pessoa escolher no baralho fechado (o molde do prompt cai em qualquer um dos três). */
export const PEDIDO_DO_BARALHO = /\b22\s+cartas\b|\b1\s*(?:a|à|até)\s*22\b|\b(?:3|três)\s+números\b/i;

export type PassoDaLeitura =
  | { passo: "revelar_carta"; indice: 1 | 2 | 3; carta: Carta; cartas: readonly [Carta, Carta, Carta] }
  | { passo: "causa_raiz"; cartas: readonly [Carta, Carta, Carta] }
  /** `semEvidencia`: a síntese NÃO foi registrada e a agente já falou 2 vezes depois da 3ª carta. É SÍNTESE PENDENTE: o bloco
   *  manda entregá-la antes do trabalho e do valor, numa única resposta de reparo. `reparoEsgotado`: o reparo também saiu sem a
   *  marca — o bloco para de pedir (sem loop) e a etapa segue sem contar como entregue; o turno registra o incidente. */
  | { passo: "encerrada"; cartas: readonly [Carta, Carta, Carta]; semEvidencia?: true; reparoEsgotado?: true };

/** `sent_at` (quando a conversa o tem) é a RODADA do sorteio: a mesma escolha, outro dia, é outra leitura. */
type Mensagem = MensagemParaContar & { sent_at?: string | null };

const ehCartaRevelada = (m: MensagemParaContar): boolean =>
  m.direction === "outbound" && MARCA_CARTA.test(m.body ?? "");

/**
 * A causa raiz já foi dita? Vale o REGISTRO (`lib/leitura/raiz-registrada.ts`): a agente marcou a raiz
 * depois da última carta. Sem registro, a etapa só fecha quando a agente já falou em DOIS turnos depois da
 * resposta à 3ª carta (um turno pode ter sido a resposta a uma dúvida) — e aí fecha SEM evidência: o bloco para de pedir a
 * síntese, mas ela não conta como entregue. Bolhas seguidas da agente, sem a
 * pessoa no meio, são um turno só. A resposta da agente anterior a `REGISTRO_DA_RAIZ_DESDE` segue a regra
 * antiga (um turno basta): conversa que estava no meio quando o registro entrou não volta para a raiz.
 */
function causaRaizJaDita(
  depoisDaEscolha: readonly Mensagem[],
  raizesDitas: readonly Date[],
  cartas: readonly Carta[] = [],
): "registrada" | "sem_evidencia" | "reparo_esgotado" | null {
  let ultimaCarta = -1;
  depoisDaEscolha.forEach((m, i) => {
    if (ehCartaRevelada(m)) ultimaCarta = i;
  });
  const horaDaCarta = depoisDaEscolha[ultimaCarta]?.sent_at;
  const desde = horaDaCarta ? new Date(horaDaCarta).getTime() : null;
  if (raizesDitas.some((d) => desde === null || d.getTime() >= desde)) return "registrada";
  // A marca escondida nunca veio do modelo em produção (0 de 130 leituras, 19–23/11/2026): a síntese também
  // conta quando o PRÓPRIO TEXTO a mostra, numa mensagem da agente depois da 3ª carta.
  if (depoisDaEscolha.some((m, i) => i > ultimaCarta && m.direction === "outbound" && ehSinteseDasCartas(m.body ?? "", cartas))) {
    return "registrada";
  }

  const resposta = depoisDaEscolha.findIndex((m, i) => i > ultimaCarta && m.direction === "inbound");
  if (resposta < 0) return null;
  let turnos = 0;
  let primeiroTurno: Mensagem | null = null;
  for (let i = resposta + 1; i < depoisDaEscolha.length; i++) {
    const m = depoisDaEscolha[i]!;
    if (m.direction === "outbound" && depoisDaEscolha[i - 1]!.direction !== "outbound") {
      turnos++;
      primeiroTurno ??= m;
    }
  }
  if (turnos >= 3) return "reparo_esgotado";
  if (turnos === 2) return "sem_evidencia";
  const antigo = primeiroTurno?.sent_at != null && new Date(primeiroTurno.sent_at).getTime() < REGISTRO_DA_RAIZ_DESDE.getTime();
  return turnos === 1 && antigo ? "registrada" : null;
}

const AS_TRES_JUNTAS =
  /\b(?:juntando|unindo|somando|olhando)\s+(?:as\s+)?(?:tr[eê]s|3)\b|\b(?:tr[eê]s|3)\s+(?:cartas\s+)?juntas\b|\b(?:tr[eê]s|3)\s+cartas\s+(?:conversam|contam|mostram|falam)\b/i;

/**
 * A mensagem é a síntese das 3 cartas? Liga as três ("juntando as três", "as 3 cartas juntas") ou cita pelo
 * nome completo pelo menos duas delas na mesma mensagem — o que a revelação de UMA carta não faz. Puro.
 */
export function ehSinteseDasCartas(texto: string, cartas: readonly Carta[]): boolean {
  if (MARCA_CARTA.test(texto)) return false;
  if (AS_TRES_JUNTAS.test(texto)) return true;
  const baixo = texto.toLowerCase();
  return cartas.filter((c) => baixo.includes(c.nome.toLowerCase())).length >= 2;
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
export function recusaDaCartaForaDoSorteio(
  corpo: string,
  passo: PassoDaLeitura | null,
  cartaJaSaiuNoTurno = false,
): string | null {
  const marca = MARCA_CARTA.exec(corpo);
  if (!marca) {
    // LEITURA SEM A CARTA: com carta a revelar e nenhuma revelada ainda neste turno, a agente não interpreta "as
    // cartas" de cabeça. Medido em 19/10/2026 (Adilson, pergunta paga): o motor mandava revelar A Torre e ela
    // respondeu "o que as cartas mostram aqui é…" sem carta nem foto, seguindo o roteiro e não o bloco.
    if (passo?.passo === "revelar_carta" && !cartaJaSaiuNoTurno && LEITURA_SEM_CARTA.test(corpo)) {
      return (
        `Há uma carta sorteada esperando: revele agora a CARTA ${passo.indice} ("${passo.carta.nome}"), começando a mensagem por ` +
        `"CARTA ${passo.indice}: ${passo.carta.nome}" — o sistema manda a foto dela. Não interprete as cartas antes de revelá-la.`
      );
    }
    return null;
  }
  const pedida = Number(marca[1]);
  if (passo === null) {
    return (
      "A pessoa ainda não escolheu 3 números válidos de 1 a 22, então não há carta sorteada: NÃO revele carta agora. " +
      "Diga com leveza quais números você já recebeu (se recebeu algum) e peça os que faltam, de 1 a 22, sem repetir. " +
      "Se ela pedir para você escolher, peça que diga 3 números quaisquer de 1 a 22."
    );
  }
  // A MESMA CARTA DUAS VEZES NO TURNO. O passo é calculado no começo do turno e só anda no turno seguinte; sem isto um
  // segundo balão com "CARTA 2:" passava como se fosse a primeira revelação. Medido em 21/11/2026: uma resposta curta da
  // cliente recebeu duas revelações da carta 2, com texto quase igual, a 4 s uma da outra.
  if (cartaJaSaiuNoTurno) {
    return `A CARTA ${pedida} já foi revelada nesta resposta, com a foto. NÃO revele de novo e não repita o que já disse: se falta algo, continue de onde parou, sem escrever "CARTA ${pedida}:".`;
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
 * já saíram; o bloco só lembra que não existe carta 4. `raizesDitas`: as horas registradas pela marca da raiz.
 */
export function passoDaLeitura(
  contatoId: string,
  mensagens: readonly Mensagem[],
  desde?: Date,
  raizesDitas: readonly Date[] = [],
): PassoDaLeitura | null {
  // O painel de Teste roda UMA mensagem: um histórico colado ali ("Lead: …" / "Esmeralda: …") vira
  // várias, como já vale para a escada de preço. Na produção nenhuma mensagem tem esse formato.
  // `desde`: uma RODADA nova da leitura (a pergunta paga) conta só o que veio depois do pagamento.
  const todas = expandirHistoricoColado(mensagens) as Mensagem[];
  const conversa = desde ? todas.filter((m) => m.sent_at != null && new Date(m.sent_at).getTime() >= desde.getTime()) : todas;

  const pedido = conversa.findIndex((m) => m.direction === "outbound" && PEDIDO_DO_BARALHO.test(m.body ?? ""));
  if (pedido < 0) return null;

  const achada = escolhaDepoisDoPedido(conversa, pedido);
  if (achada === null) return null;
  const { escolha, numeros } = achada;
  const cartas = sortearCartas(contatoId, numeros, conversa[escolha]!.sent_at ?? undefined);

  const depois = conversa.slice(escolha + 1);
  const jaReveladas = depois.filter(ehCartaRevelada).length;

  if (jaReveladas >= 3) {
    const raiz = causaRaizJaDita(depois, raizesDitas, cartas);
    if (raiz === "registrada") return { passo: "encerrada", cartas };
    if (raiz === "sem_evidencia") return { passo: "encerrada", cartas, semEvidencia: true };
    if (raiz === "reparo_esgotado") return { passo: "encerrada", cartas, semEvidencia: true, reparoEsgotado: true };
    return { passo: "causa_raiz", cartas };
  }
  const indice = (jaReveladas + 1) as 1 | 2 | 3;
  return { passo: "revelar_carta", indice, carta: cartas[indice - 1]!, cartas };
}
