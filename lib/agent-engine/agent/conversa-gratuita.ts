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
 * que o operador definiu e a rodada atual também não é comercial, o turno responde UMA vez, curto, mostrando
 * os caminhos pagos — e o envio recusa o que passar disso.
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

/** Tamanho máximo da resposta do turno em que o limite vale: um balão curto. */
export const TAMANHO_DA_RESPOSTA_LIMITADA = 420;

const textoDaRodada = (rodada: readonly MensagemDaConversa[]): string => rodada.map((m) => m.body ?? '').join('\n');

/**
 * A conversa gratuita acabou? `limite` = quantas rodadas não comerciais o agente responde de graça depois da
 * oferta. `limite` ausente, zero ou negativo desliga a regra.
 */
/**
 * Quantas respostas "escolha um caminho" a pessoa recebe depois de esgotar a conversa gratuita. Passou disso, o
 * turno não chama modelo nem envia nada (`silencioPorConversaGratuita`).
 */
export const AVISOS_DEPOIS_DO_LIMITE = 2;

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

/**
 * O SILÊNCIO DEPOIS DOS AVISOS. Medido em 12/10/2026: 30 contatos concentravam 41% do custo de IA do dia, e o
 * mais caro recebeu 186 respostas em um dia sem comprar. Quem esgotou a conversa gratuita e já recebeu os avisos
 * com os caminhos pagos não consome mais resposta: o turno termina sem chamar modelo. Qualquer rodada que fale
 * de comprar ou pagar, que traga foto ou documento (pode ser o comprovante) ou que dê sinal de risco reabre o
 * atendimento na hora — e o pedido de falar com uma pessoa é tratado antes desta regra.
 */
export function silencioPorConversaGratuita(mensagens: readonly MensagemDaConversa[], limite: number | null | undefined): boolean {
  if (!limite || limite <= 0) return false;
  const gratuitas = rodadasGratuitasRespondidas(mensagens);
  return gratuitas !== null && gratuitas >= limite + AVISOS_DEPOIS_DO_LIMITE;
}

export function conversaGratuitaEsgotada(mensagens: readonly MensagemDaConversa[], limite: number | null | undefined): boolean {
  if (!limite || limite <= 0) return false;
  const gratuitas = rodadasGratuitasRespondidas(mensagens);
  return gratuitas !== null && gratuitas >= limite;
}

/** O bloco do turno em que a conversa gratuita acabou. `caminhos` = os nomes do que está à venda. */
export function blocoDaConversaGratuitaEsgotada(esgotada: boolean, caminhos: readonly string[]): string {
  if (!esgotada) return '';
  const lista = caminhos.length > 0 ? caminhos.join(', ') : 'o trabalho';
  return [
    '',
    '',
    'A CONVERSA GRATUITA ACABOU (ESTE BLOCO VENCE TODO O RESTO NESTE TURNO)',
    '- Esta pessoa já recebeu a leitura gratuita e a oferta, não comprou, e já teve as respostas gratuitas que o operador permite.',
    `- Responda com UMA mensagem só, de até ${TAMANHO_DA_RESPOSTA_LIMITADA} caracteres: acolha em meia frase o que ela disse e diga, com carinho e firmeza, que para continuar você precisa que ela escolha um caminho: ${lista}. Termine perguntando qual ela quer.`,
    '- É PROIBIDO neste turno: aconselhar, interpretar o que ela contou, fazer pergunta sobre a vida dela, puxar assunto, reler as cartas ou prometer que você segue ali com ela. Isso é o que está à venda.',
    '- Se ela disser que não quer nenhum caminho, despeça-se em uma frase curta, sem pergunta.',
  ].join('\n');
}
