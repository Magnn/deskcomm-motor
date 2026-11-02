/**
 * O LIMITE DA CONVERSA GRATUITA — quem ouviu a oferta e não comprou não ganha atendimento sem fim.
 *
 * ─── O que se via em produção ─────────────────────────────────────────────────────────
 * Medido de 08 a 12/10/2026: 25.918 de 56.616 mensagens do agente foram para quem já tinha recebido a leitura
 * gratuita e não pagou nada; 229 conversas passaram de 30 balões depois da leitura. O roteiro dizia que o
 * acompanhamento é de quem comprou, e o modelo seguia conversando: perguntava da vida da pessoa, aconselhava,
 * puxava assunto. Instrução em texto não segurou; a regra precisa ser do código.
 *
 * ─── A régua ──────────────────────────────────────────────────────────────────────────
 * Depois que o preço foi dito, cada RODADA da pessoa (o que ela escreve entre duas falas do agente) é
 * comercial ou não. Comercial é a que fala de pagar, de valor, de data, do que está à venda, ou traz um número.
 * As rodadas não comerciais que o agente já respondeu são a conversa gratuita. Quando elas chegam ao limite
 * que o operador definiu e a rodada atual também não é comercial, cada resposta fica curta e leva no máximo uma
 * oferta por dia. O envio recusa o que passar disso.
 *
 * ─── Nunca em silêncio ───────────────────────────────────────────────────────────────
 * Até 01/11/2026, depois de dois avisos o turno terminava sem responder. Decisão do dono no mesmo dia: quem não
 * aceitou hoje pode aceitar amanhã, e o papel da agente é vender. Medido: 14 turnos silenciados em 3 dias, entre eles
 * a Elisangela, que tinha comprado duas vezes e contou que o Lineu respondeu.
 *
 * ─── O que NUNCA é limitado ───────────────────────────────────────────────────────────
 * Quem já pagou, quem tem um período pago valendo (quem chama decide), a rodada comercial (é a venda
 * acontecendo) e a rodada com sinal de risco à vida ou de violência: a regra de cuidado vem antes de qualquer
 * regra de cobrança.
 *
 * Tudo aqui é puro.
 */
export interface MensagemDaConversa {
  direction: string;
  body: string | null | undefined;
  sent_at?: string;
}

/** O preço foi dito por quem atende. O mesmo sinal que `lib/preco` usa. */
const PRECO_DITO = /R\$\s?\d|\b\d+(?:[.,]\d+)?\s*reais?\b/i;

/**
 * A rodada fala de comprar, pagar, valor, data ou do que está à venda — ou traz um número (escolha, valor, dia).
 * Dúvida e desconfiança sobre a oferta ("funciona?", "é golpe?", "tem garantia?") também são comerciais: medido,
 * quem pergunta isso compra mais do que quem diz "ok".
 */
const COMERCIAL =
  /\d|d[úu]vida|n[ãa]o\s+entend|como\s+funciona|\besper(?:a|ar|e)\b|\bpag|\bpix\b|\bvalor|\bquanto\b|\bpre[çc]o|\breais\b|r\$|\blink\b|\bcart[ãa]o|\bparcel|\bquero\b|\baceito\b|pode\s+mandar|\breceb|\bsal[áa]rio|\bboleto|comprovante|\bdinheiro|\bdesconto|\bentrada\b|\brestante|\bcomprar|\bcontrat|\bfa[çc]o\b|\bcomo (eu )?fa[çc]o|\bfunciona|\bgolpe|\bgarant|\bconfi[aáo]|\bseguro\b|\benganad|\btrabalho|\brito\b|\bresultado|\bdemora|\bquanto tempo|\bpergunta|\bacompanhamento|\[(?:image|imagem|foto|document|documento|arquivo)|o cliente enviou uma m[íi]dia/i;

/** Sinal de risco à vida ou de violência: aqui o limite nunca vale. */
const RISCO =
  /suic|me matar|tirar (a )?minha vida|n[ãa]o quero mais viver|quero morrer|vontade de morrer|me machucar|me cortar|me bate\b|me bateu|me agrid|apanh(o|ei|ando)|viol[êe]ncia|me amea[çc]/i;

/** Uma oferta por dia: dentro deste intervalo, a agente responde sem repetir valor. */
const INTERVALO_ENTRE_OFERTAS_MS = 16 * 60 * 60 * 1000;

/** Tamanho máximo da resposta do turno em que o limite vale: um balão curto. */
export const TAMANHO_DA_RESPOSTA_LIMITADA = 420;

const textoDaRodada = (rodada: readonly MensagemDaConversa[]): string => rodada.map((m) => m.body ?? '').join('\n');

/**
 * A conversa gratuita acabou? `limite` = quantas rodadas não comerciais o agente responde de graça depois da
 * oferta. `limite` ausente, zero ou negativo desliga a regra.
 */
/**
 * A última pergunta de quem atende era sobre PAGAR ("Quer que eu te mande o Pix de R$ 60 agora?"). O que a pessoa
 * responde a isso é a venda acontecendo, mesmo que seja "não sei ainda" ou "tudo bem". Medido em 12/10/2026: três
 * respostas a uma oferta nova ficaram sem resposta porque a rodada, sozinha, não tinha palavra de compra.
 */
const PERGUNTA_DE_PAGAMENTO = /(\bpix\b|r\$|\bpagar|\bpagamento|\bcart[ãa]o|\bboleto|\blink\b|\bvalor\b)[^?.!\n]*\?\s*$/i;

interface Rodada {
  texto: string;
  /** A fala de quem atende logo antes desta rodada. */
  anterior: string;
}

const rodadaComercial = (r: Rodada): boolean => COMERCIAL.test(r.texto) || PERGUNTA_DE_PAGAMENTO.test(r.anterior.trim());

/** As rodadas da pessoa depois da oferta, na ordem; `aberta` é a que este turno responde (ou `null`). */
function rodadasDepoisDaOferta(mensagens: readonly MensagemDaConversa[]): { respondidas: Rodada[]; aberta: Rodada | null } | null {
  const oferta = mensagens.findIndex((m) => m.direction === 'outbound' && PRECO_DITO.test(m.body ?? ''));
  if (oferta === -1) return null;
  const respondidas: Rodada[] = [];
  let anterior = mensagens[oferta]!.body ?? '';
  let atual: MensagemDaConversa[] = [];
  let anteriorDaAtual = anterior;
  for (let i = oferta + 1; i < mensagens.length; i++) {
    const m = mensagens[i]!;
    if (m.direction === 'inbound') {
      if (atual.length === 0) anteriorDaAtual = anterior;
      atual.push(m);
    } else {
      if (atual.length > 0) {
        respondidas.push({ texto: textoDaRodada(atual), anterior: anteriorDaAtual });
        atual = [];
      }
      anterior = m.body ?? '';
    }
  }
  return { respondidas, aberta: atual.length > 0 ? { texto: textoDaRodada(atual), anterior: anteriorDaAtual } : null };
}

/**
 * Quantas rodadas NÃO comerciais o agente já respondeu depois da oferta — ou `null` quando a regra não se aplica
 * a este turno (oferta ainda não feita, ninguém escreveu, ou a rodada atual é comercial ou de risco).
 */
export function rodadasGratuitasRespondidas(mensagens: readonly MensagemDaConversa[]): number | null {
  const r = rodadasDepoisDaOferta(mensagens);
  if (r === null || r.aberta === null) return null;
  if (RISCO.test(r.aberta.texto) || rodadaComercial(r.aberta)) return null;
  return r.respondidas.filter((x) => !rodadaComercial(x)).length;
}

export function conversaGratuitaEsgotada(mensagens: readonly MensagemDaConversa[], limite: number | null | undefined): boolean {
  if (!limite || limite <= 0) return false;
  const gratuitas = rodadasGratuitasRespondidas(mensagens);
  return gratuitas !== null && gratuitas >= limite;
}

/** A agente já falou um valor nas últimas horas: a próxima oferta fica para o dia seguinte. */
export function ofereceuHoje(mensagens: readonly MensagemDaConversa[], agora: Date = new Date()): boolean {
  return mensagens.some(
    (m) =>
      m.direction === 'outbound' &&
      m.sent_at !== undefined &&
      agora.getTime() - new Date(m.sent_at).getTime() < INTERVALO_ENTRE_OFERTAS_MS &&
      PRECO_DITO.test(m.body ?? ''),
  );
}

/** O bloco do turno depois da conversa gratuita. `caminhos` = os nomes do que está à venda. */
export function blocoDaConversaGratuitaEsgotada(esgotada: boolean, caminhos: readonly string[], jaOfereceuHoje = false): string {
  if (!esgotada) return '';
  const lista = caminhos.length > 0 ? caminhos.join(', ') : 'o trabalho';
  const outras = caminhos.filter((c) => c !== 'o trabalho').join(', ');
  return [
    '',
    '',
    'CONVERSA DEPOIS DA OFERTA (ESTE BLOCO VENCE TODO O RESTO NESTE TURNO)',
    '- Esta pessoa já recebeu a leitura e a oferta e ainda não comprou. Seu papel é vender: mantenha o contato e procure a oportunidade. Quem não aceitou hoje pode aceitar amanhã.',
    `- Responda com UMA mensagem só, de até ${TAMANHO_DA_RESPOSTA_LIMITADA} caracteres, e acolha em meia frase o que ela disse.`,
    jaOfereceuHoje
      ? // Medido em 01/11/2026: Elisangela recusou R$ 60 de manhã, voltou à noite com a resposta do Lineu e não ouviu oferta nenhuma.
        `- Hoje ela já ouviu o valor do trabalho: NÃO repita esse valor. A oferta do trabalho volta em outro dia.${outras === '' ? '' : ` Se ela trouxe algo novo sobre a pessoa ou a situação, ofereça UMA destas, a que mais responde ao que ela contou: ${outras}, pelo valor do bloco de cobranças.`} Termine sempre com uma pergunta curta.`
      : `- Ligue o que ela contou a UMA oferta, a que mais responde a isso: ${lista}. Use o valor que os blocos de preço e de cobranças liberarem e termine perguntando se ela quer, ou quanto ela consegue hoje.`,
    '- É PROIBIDO neste turno: aconselhar em detalhe, interpretar o que ela contou, reler as cartas ou prometer acompanhamento. Isso é o que está à venda.',
    '- Se ela disser que hoje não dá, aceite sem insistir e não se despeça de vez. Se ela pedir para parar ou para não ser procurada, pare.',
  ].join('\n');
}
