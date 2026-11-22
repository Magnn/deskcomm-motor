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

/** Marca que o envio troca pela cobrança, ou um link no próprio corpo. */
const COBRANCA_NO_CORPO = /\[\[\s*(?:PIX|CHAVE PIX|BOLETO)\b[^\]]*\]\]|https?:\/\/\S+/i;

/** "a chave … vai aqui", "o link segue abaixo", "vou te mandar a chave", "te mando o Pix agora". */
const ANUNCIO = [
  /\b(?:chave|pix|link|c[óo]digo)\b[^.!?\n]{0,60}?\b(?:vai|v[ãa]o|segue|seguem)\s+(?:aqui|abaixo|agora|logo|j[áa]|em seguida|na pr[óo]xima)/i,
  /\b(?:vou|j[áa] vou|deixa eu)\s+(?:te\s+|lhe\s+)?(?:mandar|enviar|passar)\s+(?:a|o)\s+(?:sua\s+|tua\s+)?(?:chave|pix|link|c[óo]digo)\b/i,
  /\b(?:te|lhe)\s+(?:mando|envio|passo)\s+(?:a|o)\s+(?:chave|pix|link|c[óo]digo)\b/i,
];

/** "conseguiu copiar a chave?" — só faz sentido se alguma chave/código/link já saiu na conversa. */
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
