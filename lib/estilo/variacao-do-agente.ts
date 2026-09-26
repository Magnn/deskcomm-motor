/**
 * VARIAÇÃO DE ESTILO — o que a agente JÁ REPETIU nas últimas mensagens dela, contado pelo código.
 *
 * Camada UNIVERSAL e invisível: vale para todo agente de toda organização, o cliente não a vê nem a
 * edita. Existe porque um modelo pequeno não se vigia entre turnos: cada resposta sai isolada, e o
 * que aparece na conversa inteira é a mesma abertura ("Entendi!"), o mesmo fecho ("Quer que eu te
 * explique melhor?"), o mesmo emoji, a mesma frase de atendente. Pedir "varie" em prosa, no prompt,
 * é ordem sem informação — o modelo não sabe O QUE já disse. Aqui o código lê as próprias mensagens
 * dela e entrega a lista concreta do que evitar agora.
 *
 * ─── Ordem de mando ────────────────────────────────────────────────────────────
 * É regra de ESTILO, a mais fraca do prompt. Fica ANTES de leitura, preço e entrega na fila
 * (`blocos-do-turno.ts`: o que vem depois vence) e o próprio bloco diz que qualquer molde literal
 * manda. Por isso o TURNO DE MOLDE fica de fora da conta: uma resposta que abre com um marcador em
 * caixa alta ("CARTA 1:", que a máquina de estado da leitura procura na mensagem) repete a abertura
 * POR CONSTRUÇÃO, e mandar a agente variá-la quebraria o protocolo.
 *
 * ─── O que se conta ────────────────────────────────────────────────────────────
 * Sobre os últimos turnos DELA (uma sequência de balões seguidos, sem a pessoa no meio):
 *   1. aberturas — a mesma primeira palavra (ou a mesma FAMÍLIA: "Entendi"/"Entendo") em 2 dos 3
 *      últimos turnos, ou em 3 dos 5;
 *   2. frases feitas de atendente ("com certeza", "fico à disposição") em 2 dos 4 últimos;
 *   3. fecho — a última frase do turno, quase igual (palavras em comum) em 2 dos 4 últimos;
 *   4. emoji — o mesmo em 3 dos 4 últimos; ou emoji em 3 dos 4 últimos com a pessoa sem usar nenhum;
 *   5. terminar SEMPRE em pergunta — os 3 últimos turnos.
 * Sem nenhuma repetição, o bloco é '' e o system do turno segue idêntico (prefixo cacheável intacto).
 *
 * Pura e determinística: as mesmas mensagens dão o mesmo bloco. Nunca lança: entrada estranha
 * (corpo nulo, marcador de mídia) é ignorada, e o pior caso é o bloco sumir.
 */
import { expandirHistoricoColado, type MensagemParaContar } from "@/lib/preco/estado-da-negociacao";

/** Quantos turnos da agente entram na conta (os mais recentes). */
const JANELA_DE_TURNOS = 5;

/** Teto do exemplo citado de volta ao modelo (um fecho, uma frase). */
const TETO_DO_EXEMPLO = 80;

/**
 * Palavras que abrem frase sem serem tique: repeti-las não é o defeito que este bloco combate
 * ("E ...", "Que ...", "Você ..."), e listá-las mandaria a agente contorcer a frase à toa.
 */
const ABERTURAS_QUE_NAO_SAO_TIQUE = new Set([
  "e", "a", "o", "as", "os", "que", "de", "do", "da", "em", "no", "na", "um", "uma", "para", "por",
  "com", "mas", "se", "me", "te", "eu", "voce", "vc", "isso", "esse", "essa", "ai", "la", "aqui", "ja",
]);

/**
 * O repertório de frases de atendente automático, no português do WhatsApp. É o que denuncia um
 * robô quando aparece TODA hora — dita uma vez, é só educação. Cada uma é comparada sem acento,
 * sem pontuação e em palavra inteira.
 */
const FRASES_FEITAS = [
  "com certeza",
  "fico à disposição",
  "estou à disposição",
  "sem problemas",
  "entendo perfeitamente",
  "é um prazer",
  "que bom",
  "perfeito",
  "ótimo",
  "claro",
  "posso te ajudar",
  "em que posso ajudar",
  "mais alguma dúvida",
  "qualquer dúvida",
  "fique à vontade",
  "sinta-se à vontade",
  "compreendo",
  "entendido",
] as const;

export interface RepeticoesDaAgente {
  /** Primeiras palavras que ela repetiu, como as escreveu, da mais recente para a mais antiga. */
  aberturas: string[];
  /** Frases feitas repetidas, na forma do repertório. */
  frasesFeitas: string[];
  /** Um exemplo (a frase mais recente) de fecho repetido; `null` se não há. */
  fecho: string | null;
  /** Emojis que ela repetiu. Vazio quando `semEmojiPelaPessoa` cobre o caso. */
  emojis: string[];
  /** Ela usa emoji e a pessoa não usou nenhum. */
  semEmojiPelaPessoa: boolean;
  /** Os 3 últimos turnos dela terminaram em pergunta. */
  sempreTerminaEmPergunta: boolean;
}

interface Turno {
  bolhas: string[];
}

const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Um balão que é só marcador de mídia ("[áudio]") não é fala dela. */
const ehSoMarcador = (corpo: string): boolean => /^\s*\[[^\]]{1,40}\]\s*$/.test(corpo);

/** "CARTA 1:", "LEITURA:" — marcador em caixa alta no começo do balão: molde literal. */
const ABRE_COM_MARCADOR_DE_MOLDE = /^\s*\p{Lu}[\p{Lu}\d ]{2,}:/u;

function turnosDaAgente(mensagens: readonly MensagemParaContar[]): Turno[] {
  const turnos: Turno[] = [];
  let atual: Turno | null = null;
  for (const m of expandirHistoricoColado(mensagens)) {
    if (m.direction === "outbound") {
      const corpo = (m.body ?? "").trim();
      if (corpo === "" || ehSoMarcador(corpo)) continue;
      if (atual === null) {
        atual = { bolhas: [] };
        turnos.push(atual);
      }
      atual.bolhas.push(corpo);
    } else if (m.direction === "inbound") {
      atual = null;
    }
  }
  return turnos;
}

const ehTurnoDeMolde = (t: Turno): boolean => t.bolhas.some((b) => ABRE_COM_MARCADOR_DE_MOLDE.test(b));

/**
 * A primeira palavra de verdade da fala dela (sem emoji, aspas ou pontuação na frente), e a FAMÍLIA
 * dela: as 5 primeiras letras quando a palavra tem 6 ou mais. "Entendi", "Entendo" e "Entendida" são
 * o mesmo tique com outra terminação — medido no painel de Teste, o modelo obedeceu "não abra com
 * Entendi" abrindo com "Entendo". A palavra curta (até 5 letras) vale inteira: "Certo" e "Certeza"
 * não são a mesma abertura.
 */
function primeiraPalavra(turno: Turno): { chave: string; exibida: string } | null {
  const achou = /\p{L}[\p{L}\p{N}'-]*/u.exec(turno.bolhas[0] ?? "");
  if (achou === null) return null;
  const palavra = normalizar(achou[0]);
  if (palavra.length < 3 || ABERTURAS_QUE_NAO_SAO_TIQUE.has(palavra)) return null;
  const chave = palavra.length >= 6 ? palavra.slice(0, 5) : palavra;
  return { chave, exibida: achou[0] };
}

/** A última frase do turno (a do último balão), como ela escreveu. */
function ultimaFrase(turno: Turno): string {
  const ultimo = turno.bolhas[turno.bolhas.length - 1] ?? "";
  const frases = ultimo
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((f) => f.trim())
    .filter((f) => f !== "");
  return frases[frases.length - 1] ?? "";
}

const palavrasDe = (frase: string): Set<string> => new Set(normalizar(frase).split(" ").filter((p) => p !== ""));

/** Quanto duas frases se parecem: palavras em comum sobre palavras no total (0 a 1). */
function semelhanca(a: string, b: string): number {
  const pa = palavrasDe(a);
  const pb = palavrasDe(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / (pa.size + pb.size - comuns);
}

const emojisDe = (texto: string): Set<string> => new Set(texto.match(/\p{Extended_Pictographic}/gu) ?? []);

const emojisDoTurno = (t: Turno): Set<string> => emojisDe(t.bolhas.join(" "));

const terminaEmPergunta = (t: Turno): boolean =>
  /\?[\s\p{Extended_Pictographic}\p{M}‍️]*$/u.test((t.bolhas[t.bolhas.length - 1] ?? "").trim());

/** Cita de volta uma fala dela: uma linha, sem aspas duplas (o exemplo vai entre aspas), com teto. */
function citar(frase: string): string {
  const limpa = frase.replace(/["“”]/g, "'").replace(/\s+/g, " ").trim();
  if (limpa.length <= TETO_DO_EXEMPLO) return limpa;
  const corte = limpa.slice(0, TETO_DO_EXEMPLO);
  return `${corte.slice(0, Math.max(corte.lastIndexOf(" "), 1))}…`;
}

/** As repetições da agente nas últimas mensagens; `null` quando não há o que dizer. */
export function lerRepeticoesDaAgente(mensagens: readonly MensagemParaContar[]): RepeticoesDaAgente | null {
  const todos = turnosDaAgente(mensagens);
  // Molde não conta: repete por construção, e é a máquina de estado (não o estilo) que o governa.
  const turnos = todos.filter((t) => !ehTurnoDeMolde(t)).slice(-JANELA_DE_TURNOS);
  if (turnos.length < 2) return null;

  const ultimos3 = turnos.slice(-3);
  const ultimos4 = turnos.slice(-4);

  // 1. aberturas
  const contagem = new Map<string, { formas: string[]; nos3: number; nos5: number }>();
  turnos.forEach((t, i) => {
    const p = primeiraPalavra(t);
    if (p === null) return;
    const c = contagem.get(p.chave) ?? { formas: [], nos3: 0, nos5: 0 };
    c.nos5++;
    if (i >= turnos.length - 3) c.nos3++;
    // As formas da família que ela escreveu, sem repetir, a mais recente por último ("Entendi", "Entendo").
    c.formas = [...c.formas.filter((f) => f !== p.exibida), p.exibida];
    contagem.set(p.chave, c);
  });
  const aberturas = [...contagem.values()]
    .filter((c) => c.nos3 >= 2 || c.nos5 >= 3)
    .reverse() // a família mais recente primeiro...
    .flatMap((c) => [...c.formas].reverse()); // ...e, dentro dela, a forma mais recente primeiro

  // 2. frases feitas
  const frasesFeitas = FRASES_FEITAS.filter((frase) => {
    const alvo = ` ${normalizar(frase)} `;
    return ultimos4.filter((t) => ` ${normalizar(t.bolhas.join(" "))} `.includes(alvo)).length >= 2;
  });

  // 3. fecho: a frase final mais recente que outro dos 4 últimos turnos repete quase igual
  let fecho: string | null = null;
  const fechos = ultimos4.map(ultimaFrase);
  for (let i = fechos.length - 1; i >= 0 && fecho === null; i--) {
    const f = fechos[i]!;
    if (palavrasDe(f).size < 3) continue;
    const parecidos = fechos.filter((outro, j) => j !== i && semelhanca(f, outro) >= 0.6).length;
    if (parecidos >= 1) fecho = citar(f);
  }

  // 4. emoji
  const daPessoa = expandirHistoricoColado(mensagens)
    .filter((m) => m.direction === "inbound")
    .slice(-6);
  const pessoaUsaEmoji = daPessoa.some((m) => emojisDe(m.body ?? "").size > 0);
  const turnosComEmoji = ultimos4.filter((t) => emojisDoTurno(t).size > 0).length;
  const semEmojiPelaPessoa = ultimos4.length >= 3 && turnosComEmoji >= 3 && !pessoaUsaEmoji;
  const porEmoji = new Map<string, number>();
  for (const t of ultimos4) for (const e of emojisDoTurno(t)) porEmoji.set(e, (porEmoji.get(e) ?? 0) + 1);
  const emojis = semEmojiPelaPessoa ? [] : [...porEmoji].filter(([, n]) => n >= 3).map(([e]) => e);

  // 5. pergunta em todo turno
  const sempreTerminaEmPergunta = ultimos3.length === 3 && ultimos3.every(terminaEmPergunta);

  const nada =
    aberturas.length === 0 &&
    frasesFeitas.length === 0 &&
    fecho === null &&
    emojis.length === 0 &&
    !semEmojiPelaPessoa &&
    !sempreTerminaEmPergunta;
  if (nada) return null;
  return { aberturas, frasesFeitas: [...frasesFeitas], fecho, emojis, semEmojiPelaPessoa, sempreTerminaEmPergunta };
}

const listaEntreAspas = (itens: readonly string[]): string => itens.map((i) => `"${i}"`).join(", ");

/**
 * O bloco do turno. `''` quando a agente não se repetiu — a maioria dos turnos, e é assim que o
 * system segue idêntico. Vai no FIM do prompt, na posição de `estilo` da fila de blocos.
 */
export function blocoDeVariacao(mensagens: readonly MensagemParaContar[]): string {
  let r: RepeticoesDaAgente | null;
  try {
    r = lerRepeticoesDaAgente(mensagens);
  } catch {
    return ""; // o estilo nunca derruba o turno
  }
  if (r === null) return "";

  const linhas = [
    "",
    "",
    "VARIAÇÃO DE ESTILO (contada pelo sistema sobre as SUAS últimas mensagens; não é fala da pessoa)",
    "Você vem se repetindo. Nesta resposta:",
  ];
  if (r.aberturas.length > 0) {
    linhas.push(
      `- Não abra de novo com ${listaEntreAspas(r.aberturas.slice(0, 3))}, nem com outra forma da mesma palavra. Comece por outra palavra.`,
    );
  }
  if (r.frasesFeitas.length > 0) {
    linhas.push(`- Deixe de fora as frases de sempre: ${listaEntreAspas(r.frasesFeitas.slice(0, 3))}.`);
  }
  if (r.fecho !== null) {
    linhas.push(`- Não feche de novo com algo como "${r.fecho}". Feche de outro jeito, ou sem fecho.`);
  }
  if (r.semEmojiPelaPessoa) {
    linhas.push("- A pessoa não usa emoji: não use nenhum.");
  } else if (r.emojis.length > 0) {
    linhas.push(`- Não use de novo ${r.emojis.slice(0, 3).join(" ")}.`);
  }
  if (r.sempreTerminaEmPergunta) {
    linhas.push("- Não termine com pergunta desta vez: afirme e deixe a pessoa responder.");
  }
  linhas.push(
    'Isto é só estilo. Qualquer molde literal deste prompt (frase entre aspas, marcador como "CARTA 1:", linha pronta) vale mais e sai palavra por palavra.',
  );
  return linhas.join("\n");
}
