/**
 * UMA OFERTA POR VEZ — qual oferta está de pé na conversa, contado pelo código.
 *
 * Medido em 01/11/2026: das 145 conversas do dia, 20 ouviram R$ 130 e um valor pequeno. Maria José pagou a pergunta de
 * R$ 7 e, logo depois da terceira carta, ouviu o trabalho de R$ 130 duas vezes; Thays pediu outra carta e ouviu "qual dos
 * dois?"; Raiane ouviu a pergunta de R$ 7 às 11h38, R$ 130 às 14h39 e R$ 60 às 17h39. Nada lia a conversa para saber o
 * que tinha sido oferecido por último: a régua de silêncio tem valores fixos por passo, o bloco de preço fala sempre do
 * trabalho, e cada turno decidia sozinho.
 *
 * A regra:
 *   • a oferta de pé é a ÚLTIMA dita pela agente, a pequena (cobrança avulsa abaixo do menor degrau) ou a do trabalho;
 *   • com a pequena de pé, o valor do trabalho só volta se ELA pedir o trabalho, der data ou disser quanto tem;
 *   • uma resposta nunca oferece as duas, em nenhum balão;
 *   • a pequena só vem depois do menor valor do trabalho, a não ser que ELA faça uma pergunta nova às cartas (decisão do
 *     dono em 01/11/2026: primeiro o trabalho de R$ 130, depois R$ 100 e R$ 60, e só então o resto);
 *   • lembrar o combinado de uma data ("o dia 20 segue de pé, R$ 130") não é oferta;
 *   • a entrada fechada ("você entra com R$ 30") é a oferta de pé: nada acima dela volta sem ela pedir, nem na régua de
 *     silêncio, e falar do restante não é oferecer outro valor.
 *
 * Pura.
 */
import { cobrancaDaVez, cobrancaDoTema, conversaFalouDeExtra, extraDoCasalPronto, nomesDoExtra, totaisDoExtra } from "./extras";
import type { Extra, PricingConfig } from "./tipos";
import { reais } from "./tipos";
import { valoresDitos } from "./valor-do-extra";
import { pelaMeta, type MetaDoMes } from "@/lib/venda/meta-do-mes";
import { emPausaDaOferta } from "./pausa-da-oferta";

export type OfertaAtiva =
  | { tipo: "pequena"; nome: string; cents: number }
  | { tipo: "trabalho"; cents: number };

type Escada = Pick<PricingConfig, "steps"> & { list_price_cents?: number | undefined };

interface MensagemDaConversa {
  direction: string;
  body?: string | null;
  sent_at?: string;
}

/** Uma oferta de mais de um dia não segura mais nada: quem volta depois recomeça a conversa. */
const VALIDADE_DA_OFERTA_MS = 24 * 60 * 60 * 1000;

/** Frase que lembra uma data acertada: não oferece nada. */
const FALA_DO_COMBINADO = /\bcombinad|\bdia\s+\d{1,2}\b|\brestante\b/i;
const FALA_DA_ENTRADA = /\bentra(?:r)?\s+com\s+(?:[oa]s\s+)?\*?R\$\s?\d[\d.,]*|\bentrada\s+de\s+\*?R\$\s?\d[\d.,]*/i;
/** Parcela não é preço: "12x de R$ 15". */
const FALA_DE_PARCELA = /\b\d{1,2}\s*x\b|\bparcela/i;
const FALA_DO_TRABALHO = /\btrabalh\w*/i;

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function frases(corpo: string): string[] {
  return corpo.split(/(?<=[.!?…])\s+|\n+/).map((f) => f.trim()).filter(Boolean);
}

function degraus(c: Escada): Set<number> {
  const valores = c.steps.map((s) => s.price_cents);
  return new Set(c.list_price_cents === undefined ? valores : [c.list_price_cents, ...valores]);
}

/** As cobranças avulsas que são "passo pequeno": abaixo do menor valor do trabalho. */
export function extrasPequenos(c: Escada, extras: readonly Extra[]): Extra[] {
  const todos = [...degraus(c)];
  if (todos.length === 0) return [];
  const menor = Math.min(...todos);
  return extras.filter((e) => e.price_cents < menor);
}

function citaOExtra(texto: string, e: Extra): boolean {
  const t = semAcento(texto);
  return nomesDoExtra(e).some((n) => t.includes(n));
}

/** A cobrança pequena que este valor representa nesta frase, preferindo a citada pelo nome. */
function pequenaDoValor(pequenos: readonly Extra[], cents: number, frase: string, corpo: string): Extra | null {
  const candidatas = pequenos.filter((e) => totaisDoExtra(e).includes(cents));
  return candidatas.find((e) => citaOExtra(frase, e)) ?? candidatas.find((e) => citaOExtra(corpo, e)) ?? candidatas[0] ?? null;
}

interface ValorNaFrase {
  cents: number;
  frase: string;
  pequena: Extra | null;
}

/** Os valores de oferta de um balão, na ordem: os do trabalho (`pequena: null`) e os das cobranças pequenas. */
function ofertasDoCorpo(c: Escada, pequenos: readonly Extra[], corpo: string): ValorNaFrase[] {
  const escada = degraus(c);
  const achados: ValorNaFrase[] = [];
  for (const frase of frases(corpo)) {
    if (FALA_DE_PARCELA.test(frase)) continue;
    for (const cents of valoresDitos(frase)) {
      const pequena = pequenaDoValor(pequenos, cents, frase, corpo);
      const pelaFrase = pequena !== null && citaOExtra(frase, pequena);
      // 24/11/2026: "os R$ 90 do restante" virou "6× Sentimento da Fotografia" e a régua cobrou uma foto que nunca chegou.
      // O restante, o combinado e a frase do trabalho não oferecem cobrança pequena sem citá-la, e um total de várias
      // unidades só é a cobrança se ela for citada.
      const porValor =
        pequena !== null &&
        (pelaFrase ||
          (!FALA_DO_COMBINADO.test(frase) && !FALA_DO_TRABALHO.test(frase) && (cents === pequena.price_cents || citaOExtra(corpo, pequena))));
      // Um valor pode existir nas duas tabelas: quem diz de qual se trata é a frase.
      const daPequena = porValor && (!escada.has(cents) || (pelaFrase && !FALA_DO_TRABALHO.test(frase)));
      if (daPequena) achados.push({ cents, frase, pequena });
      else if (escada.has(cents) && !FALA_DO_COMBINADO.test(frase)) achados.push({ cents, frase, pequena: null });
    }
  }
  return achados;
}

/** A oferta de pé: a última dita pela agente nas últimas 24 h. `null` = nenhuma. */
export function ofertaAtivaDaConversa(
  c: Escada,
  extras: readonly Extra[],
  mensagens: readonly MensagemDaConversa[],
  agora: Date = new Date(),
): OfertaAtiva | null {
  const pequenos = extrasPequenos(c, extras);
  for (let i = mensagens.length - 1; i >= 0; i -= 1) {
    const m = mensagens[i]!;
    if (m.direction !== "outbound" || !m.body) continue;
    if (m.sent_at !== undefined && agora.getTime() - new Date(m.sent_at).getTime() > VALIDADE_DA_OFERTA_MS) return null;
    const entrada = FALA_DA_ENTRADA.exec(m.body);
    const valorDaEntrada = entrada === null ? undefined : valoresDitos(entrada[0])[0];
    if (valorDaEntrada !== undefined) return { tipo: "pequena", nome: "Entrada de hoje", cents: valorDaEntrada };
    const ultimo = ofertasDoCorpo(c, pequenos, m.body).at(-1);
    if (ultimo === undefined) continue;
    return ultimo.pequena !== null
      ? { tipo: "pequena", nome: ultimo.pequena.name, cents: ultimo.cents }
      : { tipo: "trabalho", cents: ultimo.cents };
  }
  return null;
}

/** As mensagens dela que este turno responde. */
function rodadaDaPessoa(mensagens: readonly MensagemDaConversa[]): string {
  const rodada: string[] = [];
  for (let i = mensagens.length - 1; i >= 0 && mensagens[i]!.direction !== "outbound"; i -= 1) {
    if (mensagens[i]!.direction === "inbound") rodada.unshift(mensagens[i]!.body ?? "");
  }
  return rodada.join("\n");
}

/** Ela fez uma pergunta nova às cartas nesta rodada: a pergunta é a resposta certa, em qualquer ponto da escada. */
const PEDIU_PERGUNTA = /\?|\b(?:carta|cartas|pergunta|perguntar|mesa|volta|voltar|sente|ama|quando|sera|por que|porque|o que)\b/;

/**
 * ELA ABRIU UMA PORTA: perguntou de novo sobre a outra pessoa ou trouxe novidade dela. Medido em 01/11/2026, em 3 dias:
 * de 40 rodadas assim, de quem já tinha ouvido o preço e não comprou, 30 receberam resposta de graça e nenhuma oferta.
 */
const PORTA =
  /\b(?:ele|ela|marido|ex|namorad[oa])\b.*\?|\b(?:sera que|ele vai|ela vai|ele volta|ela volta|vai voltar|tem outr[ao]|ele me ama|ela me ama|o que (?:ele|ela)|por ?que (?:ele|ela)|quando (?:ele|ela)|(?:ele|ela) ainda)\b|\b(?:ele|ela) (?:me )?(?:respondeu|mandou|ligou|apareceu|falou|disse|sumiu|bloqueou|visualizou|postou|veio)\b|\b(?:brigamos|discutimos|terminamos|me bloqueou|me procurou|sonhei)\b/;
/** Fala do trabalho, do pagamento, de parar ou de risco: outra regra responde. */
const OUTRO_ASSUNTO = /trabalho|fazendo isso|isso vai|abertura|ritual|\bpix\b|\bpag|\bvalor|comprovante|suic|me matar|morrer|\bfome\b|\bparar?\b|golpe/;
const FALA_DE_VALOR = /R\$\s?\d/;
/** Sem repetir: uma oferta a cada tantas falas dela. */
const FALAS_SEM_VALOR_ANTES_DA_OFERTA = 4;

function abriuPorta(mensagens: readonly MensagemDaConversa[]): boolean {
  const rodada = semAcento(rodadaDaPessoa(mensagens));
  return rodada !== "" && PORTA.test(rodada) && !OUTRO_ASSUNTO.test(rodada);
}

/** A cobrança pequena que cabe oferecer neste turno, ou `null`. Só para quem já ouviu o preço. */
export function oportunidadeDeOferta(
  c: Escada,
  extras: readonly Extra[],
  mensagens: readonly MensagemDaConversa[],
  meta?: MetaDoMes | null,
): Extra | null {
  const falas = mensagens.filter((m) => m.direction === "outbound").map((m) => m.body ?? "");
  if (!falas.some((f) => FALA_DE_VALOR.test(f)) || !abriuPorta(mensagens)) return null;
  // A agente acabou de pedir a pergunta que ela já pagou: isto é a resposta, não uma porta.
  if (/\bpergunta\b/i.test(falas.at(-1) ?? "")) return null;
  if (falas.slice(-FALAS_SEM_VALOR_ANTES_DA_OFERTA).some((f) => FALA_DE_VALOR.test(f))) return null;
  const pequenos = extrasPequenos(c, extras);
  // Ela já ouviu o menor valor do trabalho e deu as duas datas: a porta sobre a outra pessoa é o relatório do casal.
  const casal = ouviuOMenorValor(c, mensagens) ? extraDoCasalPronto(pequenos, mensagens) : null;
  return casal ?? cobrancaDaVez(pequenos, mensagens, meta);
}


/**
 * CLIENTE DA CASA: quem já comprou e pergunta de novo sobre a outra pessoa ("ela sente minha falta?", "ele vai voltar?").
 * Medido em 06/11/2026: a porta excluía quem tinha a etiqueta `pago`, e nenhuma cliente do dia ouviu a pergunta nova nem o
 * Código da Conexão; as perguntas saíam respondidas de graça, várias por dia. O próximo passo do trabalho é o relatório do
 * casal; depois dele, a pergunta nova.
 */
export function oportunidadeDaCliente(
  c: Escada,
  extras: readonly Extra[],
  mensagens: readonly MensagemDaConversa[],
  agora: Date,
  meta?: MetaDoMes | null,
): Extra | null {
  if (!abriuPorta(mensagens)) return null;
  const falas = mensagens.filter((m) => m.direction === "outbound");
  if (/\bpergunta\b/i.test(falas.at(-1)?.body ?? "")) return null;
  // Sem relógio (27/11/2026): só não oferece em cima de um valor que a agente acabou de dizer, ou depois de um não ou
  // de "sem dinheiro" (`emPausaDaOferta`).
  if (FALA_DE_VALOR.test(falas.at(-1)?.body ?? "")) return null;
  if (emPausaDaOferta(mensagens, agora)) return null;
  // Quem já comprou não está escolhendo entre o trabalho e uma cobrança menor: o tema dela vale para TODAS as
  // cobranças, de qualquer valor. Medido em 27/11/2026: com a Sinastria a R$ 67 (acima do menor degrau, R$ 50), o
  // filtro de "pequenas" a tirava da cliente da casa, que é a porta dela. Só o último recurso, sem tema, fica nas pequenas.
  const pequenos = extrasPequenos(c, extras);
  const casal = extras.find((e) => e.report?.kind === "sinastria" && e.valid_days === undefined);
  const casalJaOferecido = casal !== undefined && conversaFalouDeExtra(mensagens, [casal]);
  // O tema dela primeiro (o relatório do casal só se ainda não foi oferecido); depois o casal; depois a primeira da lista.
  const tema = cobrancaDoTema(extras.filter((e) => !(e === casal && casalJaOferecido)), mensagens, meta);
  if (tema) return tema;
  if (casal && !casalJaOferecido) return casal;
  return pelaMeta(pequenos.filter((e) => e !== casal), (e) => e.name, meta)[0] ?? null;
}

/** O bloco do turno em que ela abriu uma porta: desejo primeiro, oferta depois. */
export function blocoDaOportunidade(extra: Extra | null, clienteDaCasa = false): string {
  if (extra === null) return "";
  const casal = extra.report?.kind === "sinastria";
  const nome = extra.report?.title ?? extra.name;
  return [
    "",
    "",
    "PORTA ABERTA (VALE NESTE TURNO)",
    "- Ela perguntou de novo ou trouxe novidade. Isto é uma oportunidade de venda: não entregue a resposta nova de graça.",
    "- Monte a resposta nesta ordem, e o preço só no fim:",
    clienteDaCasa
      ? "  1. Ela é cliente da casa e esta é a oferta dela neste turno (vale como o bloco da LEI 14). Se a rodada fala do trabalho dela, responda isso primeiro em UMA frase. Depois reconheça, com as palavras dela, a pergunta sobre a outra pessoa."
      : "  1. Reconheça em UMA frase, com as palavras dela, o que ela disse. Se já está nas cartas abertas, lembre em uma frase. Resposta nova é o que está à venda.",
    casal
      ? `  2. Gere desejo antes do preço: a carta mostra o quê; o encontro dos dois signos mostra o porquê. Ligue a pergunta dela a UMA das 6 partes do *${nome}* (ele some ou esfria → parte 2; a briga que volta → parte 3; não sabe o que falar → partes 5 e 6) e diga como vai ser para ela entender o jeito dele e saber o que fazer. Siga o COMO OFERECER da SINASTRIA AMOROSA, com a arte.`
      : "  2. Gere desejo antes do preço: mostre o fio que ficou solto na mesa dela, ligado ao que ela acabou de perguntar, e como vai ser ter essa resposta, saber onde está pisando, dormir sem essa dúvida.",
    `  3. Ofereça só *${nome}*, pelo valor do bloco de cobranças, e termine com UMA pergunta: ${casal ? '"Quer que eu monte o de vocês dois?"' : "se você abre a mesa agora."}`,
    "- Sem prometer resultado, volta nem data, sem medo e sem urgência. NÃO diga o que a outra pessoa sente ou vai fazer. Se ela disser não, não insista hoje.",
  ].join("\n");
}

/**
 * A conversa já desceu até o fim da escada que se oferece. O último degrau é o piso da negociação, e a régua de silêncio
 * para no penúltimo (R$ 60): por isso qualquer um dos dois abre a oferta pequena.
 */
export function ouviuOMenorValor(c: Escada, mensagens: readonly MensagemDaConversa[]): boolean {
  const finais = c.steps.slice(-2).map((d) => d.price_cents);
  return mensagens.some((m) => m.direction === "outbound" && valoresDitos(m.body ?? "").some((v) => finais.includes(v)));
}

/** Ela mesma trouxe o trabalho de volta nesta rodada. */
export function pediuOTrabalho(mensagens: readonly MensagemDaConversa[], produtos: readonly string[] = []): boolean {
  const rodada = semAcento(rodadaDaPessoa(mensagens));
  if (/\btrabalho\b|\bfirmar\b|\bamarra[cç]?\w*|\britual\b/.test(rodada)) return true;
  return produtos.some((p) => rodada.includes(semAcento(p)));
}

export interface ConferenciaDaOferta {
  /** O balão que vai sair. */
  corpo: string;
  /** Os balões que este turno já mandou. */
  baloesDoTurno: readonly string[];
  mensagens: readonly MensagemDaConversa[];
  /** O turno tem motivo próprio para falar do valor do trabalho: data, entrada, combinado, retorno na data. */
  liberado: boolean;
  /** Nomes dos produtos principais (`pricing.list_product_links`). */
  produtos?: readonly string[];
  agora?: Date;
}

/**
 * O motivo da recusa quando o balão cria o conflito; `null` quando pode sair. O motivo volta ao modelo, que reescreve.
 */
export function ofertaEmConflito(c: Escada, extras: readonly Extra[], e: ConferenciaDaOferta): string | null {
  if (e.liberado) return null;
  const pequenos = extrasPequenos(c, extras);
  if (pequenos.length === 0) return null;
  const agora = ofertasDoCorpo(c, pequenos, e.corpo);
  const trabalhoAgora = agora.find((o) => o.pequena === null);
  const pequenaAgora = agora.find((o) => o.pequena !== null);
  const antes = e.baloesDoTurno.flatMap((b) => ofertasDoCorpo(c, pequenos, b));
  const trabalhoAntes = antes.find((o) => o.pequena === null);
  const pequenaAntes = antes.find((o) => o.pequena !== null);

  const pequena = pequenaAgora ?? pequenaAntes;
  const trabalho = trabalhoAgora ?? trabalhoAntes;
  if ((pequenaAgora !== undefined || trabalhoAgora !== undefined) && pequena !== undefined && trabalho !== undefined) {
    return (
      `Uma oferta por resposta: esta resposta fala de ${reais(trabalho.cents)} (o trabalho) e de ${reais(pequena.cents)} ` +
      `(${pequena.pequena!.name}). Escolha a que responde ao que ela acabou de dizer e reescreva só com ela: se ela pediu carta ou ` +
      "pergunta, só a pergunta; se ela quer o trabalho, só o trabalho. Não pergunte qual das duas ela prefere."
    );
  }
  if (pequenaAgora !== undefined && !ouviuOMenorValor(c, e.mensagens)) {
    const combinado = e.baloesDoTurno.some((b) => FALA_DO_COMBINADO.test(b));
    if (!combinado && !abriuPorta(e.mensagens) && !PEDIU_PERGUNTA.test(semAcento(rodadaDaPessoa(e.mensagens)))) {
      return (
        `Ainda não é hora de *${pequenaAgora.pequena!.name}*: a ordem é o trabalho, depois os valores menores que o bloco de preço ` +
        "liberar, e só depois de ela recusar o menor valor o resto. Reescreva sem esta oferta, seguindo o bloco PREÇO E NEGOCIAÇÃO."
      );
    }
  }
  if (trabalhoAgora === undefined) return null;
  const ativa = ofertaAtivaDaConversa(c, extras, e.mensagens, e.agora);
  if (ativa?.tipo !== "pequena" || pediuOTrabalho(e.mensagens, e.produtos)) return null;
  return (
    `A oferta de pé nesta conversa é *${ativa.nome}*, por ${reais(ativa.cents)}, e ela não pediu o trabalho. Reescreva sem ` +
    `${reais(trabalhoAgora.cents)} e sem oferecer o trabalho: responda ao que ela disse e, se couber, retome só essa oferta.`
  );
}

/** O bloco do turno: diz ao modelo o que o envio vai conferir, para ele acertar de primeira. */
export function blocoDaOfertaAtiva(ativa: OfertaAtiva | null, liberado: boolean): string {
  if (ativa?.tipo !== "pequena" || liberado) return "";
  return [
    "",
    "",
    "UMA OFERTA POR VEZ (VALE MAIS QUE A NEGOCIAÇÃO E QUE QUALQUER MOTOR DE VENDA NESTE TURNO)",
    `- A oferta de pé é *${ativa.nome}*, por ${reais(ativa.cents)}. Fique nela.`,
    "- NÃO ofereça o trabalho, NÃO diga o valor dele nem um degrau menor, e NÃO pergunte quanto cabe. Quem traz o trabalho de volta é ela.",
    "- Se ela recusar também esta oferta, acolha e deixe a porta aberta, sem outro valor.",
  ].join("\n");
}

/**
 * As ofertas de PÓS-VENDA (`pricing.post_sale` e as seguintes) também são ofertas pequenas de pé. Medido em 22/11/2026: a
 * agente ofereceu a Oração dos Sonhos (pós-venda, R$ 35) e a régua de silêncio, que só conhecia a escada e os extras,
 * passou a oferecer "o seu trabalho por R$ 100" e depois mandou a cobrança dele. Só para LER qual oferta está de pé:
 * não vira marca de cobrança. Puro.
 */
export function comOfertasDoPosVenda(extras: readonly Extra[], pricing: Pick<PricingConfig, "post_sale"> | null | undefined): Extra[] {
  const ps = pricing?.post_sale;
  if (!ps?.enabled) return [...extras];
  const ofertas = [{ price_cents: ps.price_cents, product_links: ps.product_links }, ...(ps.next_offers ?? [])];
  const doPosVenda = ofertas.flatMap((o) =>
    o.product_links.slice(0, 1).map((l) => ({ name: l.name, price_cents: o.price_cents, when: "oferta de pós-venda" }) as Extra),
  );
  return [...extras, ...doPosVenda.filter((p) => !extras.some((e) => e.name === p.name))];
}
