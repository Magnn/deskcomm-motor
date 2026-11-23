/**
 * COBRANÇA ANUNCIADA TEM QUE SAIR NA MESMA MENSAGEM.
 *
 * Medido em 22/11/2026: a pessoa aceitou entrada de R$ 30, pediu o Pix, e a agente escreveu "A chave do Pix
 * de R$ 30 e o link do cartão vão aqui:" — sem a marca `[[PIX: …]]`. Nada foi anexado; depois ela perguntou
 * "conseguiu copiar a chave?" e repetiu "vou te mandar num instante". Dinheiro aceito que não entra.
 *
 * Quem insere chave, código e link é o CÓDIGO, a partir de uma marca ou de um link oficial no corpo. Então o
 * texto não pode anunciar uma cobrança que ele mesmo não traz: anúncio sem marca nem link volta ao modelo,
 * que reescreve com a marca (ou sem o anúncio). Puro: decide só pelo texto e pelo histórico recebido.
 */

/**
 * Marca que o envio troca pela cobrança, link DE PAGAMENTO, código copia-e-cola ou a chave sozinha numa linha.
 * Medido na releitura de 22/11/2026: qualquer link desarmava a trava ("vou te mandar a chave agora" + o link da política de
 * privacidade passava como se a cobrança tivesse ido), e a chave de celular isolada não contava como cobrança.
 */
const COBRANCA_NO_CORPO =
  /\[\[\s*(?:PIX|CHAVE PIX|BOLETO)\b[^\]]*\]\]|https?:\/\/\S*(?:pay|buy|checkout|boleto|pagar|pagamento|invoice)\S*|(?:^|\n)\s*000201|(?:^|\n)\s*\d{10,11}\s*(?:\n|$)/i;

/** "a chave … vai aqui", "o link segue abaixo", "vou te mandar a chave", "te mando o Pix agora". */
const ANUNCIO = [
  /\b(?:chave|pix|link|c[óo]digo)\b[^.!?\n]{0,60}?\b(?:vai|v[ãa]o|segue|seguem)\s+(?:aqui|abaixo|agora|logo|j[áa]|em seguida|na pr[óo]xima)/i,
  /\b(?:vou|j[áa] vou|deixa eu)\s+(?:te\s+|lhe\s+)?(?:mandar|enviar|passar)\s+(?:a|o)\s+(?:sua\s+|tua\s+)?(?:chave|pix|link|c[óo]digo)\b/i,
  /\b(?:te|lhe)\s+(?:mando|envio|passo)\s+(?:a|o)\s+(?:chave|pix|link|c[óo]digo)\b/i,
];

/**
 * "conseguiu copiar a chave?" — só faz sentido se alguma chave/código/link já saiu na conversa.
 * shortcut: confere que ALGUMA cobrança saiu, não que é a da oferta atual (o histórico não traz a identidade da oferta);
 * trocar pela identidade do envio quando a cobrança gravar oferta e valor junto da mensagem.
 */
const PERGUNTA_SE_COPIOU = /\bconseguiu\s+(?:copiar|colar|fazer|pagar)\b[^.!?\n]{0,30}?\b(?:chave|pix|c[óo]digo|link)\b/i;

/** Uma cobrança que de fato saiu: código copia-e-cola, link de pagamento ou a chave (celular, sozinha no balão). */
const COBRANCA_ENVIADA = /(?:^|\n)000201|https?:\/\/\S*(?:pay|buy|checkout|boleto)\S*|^\s*\d{10,11}\s*$/im;

export const RECUSA_DA_COBRANCA_ANUNCIADA =
  "Você anunciou a chave, o Pix ou o link, mas esta mensagem não traz cobrança nenhuma — a pessoa não recebeu nada. " +
  "Se é hora de cobrar, escreva SOZINHA num balão a marca [[PIX: Nome]] que o bloco do turno indica (ou o link oficial do valor que vale): " +
  "o sistema troca pela chave e pelo link de verdade. Se não é hora, tire o anúncio. Nunca diga que mandou ou vai mandar algo que não está nesta mensagem.";

export function anunciaCobrancaSemCobranca(
  corpo: string,
  historico: readonly { direction: string; body?: string | null }[] = [],
): boolean {
  if (COBRANCA_NO_CORPO.test(corpo)) return false;
  if (ANUNCIO.some((r) => r.test(corpo))) return true;
  if (PERGUNTA_SE_COPIOU.test(corpo)) {
    return !historico.some((m) => m.direction === "outbound" && COBRANCA_ENVIADA.test(m.body ?? ""));
  }
  return false;
}

/** O corpo traz cobrança (marca de Pix/chave/boleto ou link)? */
export function trazCobranca(corpo: string): boolean {
  return COBRANCA_NO_CORPO.test(corpo);
}

/**
 * TOQUE DE SILÊNCIO NÃO COBRA. Medido em 22/11/2026: o 3º toque da régua, mandado só para "retomar a conversa", saiu com a
 * chave e o link de R$ 100 de um produto que ela nunca aceitou. Quem está calada não pediu cobrança: o toque pergunta, e a
 * chave sai no turno em que ela disser que quer.
 */
export const RECUSA_DA_COBRANCA_NO_TOQUE =
  "Esta é uma retomada de silêncio: a pessoa não respondeu e não pediu cobrança. NÃO mande chave, marca [[PIX: …]] nem link. " +
  "Escreva uma mensagem curta, pelo nome, retomando a última oferta com uma pergunta (por exemplo, se ela quer que você mande o Pix); a cobrança sai quando ela disser que quer.";
