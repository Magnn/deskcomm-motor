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
const PERGUNTA_SE_COPIOU = /\bconseguiu\s+(?:copiar|colar|fazer|pagar|achar|encontrar|ver)\b[^.!?\n]{0,30}?\b(?:chave|pix|c[óo]digo|link)\b/i;

/**
 * A chave dada como JÁ ENVIADA: "a chave é o número que chegou aí", "o Pix que te mandei". Medido em 27/11/2026: a pessoa
 * pediu o Pix, a agente respondeu duas vezes que a chave "chegou aí" / "já foi aí pra você", e nenhuma chave tinha saído —
 * ela ficou pedindo "achei não, manda aí". Como a pergunta "conseguiu copiar?", só vale se alguma cobrança saiu de fato.
 */
const DIZ_QUE_JA_SAIU =
  /\b(?:chave|pix|c[óo]digo|link)\b[^.!?\n]{0,80}?(?:\b(?:chegou|foi|est[áa]|t[áa])\s+(?:a[íi]|acima|pra\s+voc[êe]|para\s+voc[êe])(?![\p{L}])|\b(?:te\s+|lhe\s+)?(?:mandei|enviei|passei)\b)/iu;

/** Uma cobrança que de fato saiu: código copia-e-cola, link de pagamento ou a chave (celular, sozinha no balão). */
const COBRANCA_ENVIADA = /(?:^|\n)000201|https?:\/\/\S*(?:pay|buy|checkout|boleto)\S*|^\s*\d{10,11}\s*$/im;

export const RECUSA_DA_COBRANCA_ANUNCIADA =
  "Você anunciou a chave, o Pix ou o link, mas esta mensagem não traz cobrança nenhuma — a pessoa não recebeu nada. " +
  "Se é hora de cobrar, escreva SOZINHA num balão a marca [[PIX: Nome]] que o bloco do turno indica (ou o link oficial do valor que vale): " +
  "o sistema troca pela chave e pelo link de verdade. Se não é hora, tire o anúncio. Nunca diga que mandou ou vai mandar algo que não está nesta mensagem.";

/**
 * Quantas falas da agente para trás uma cobrança ainda conta como "a que está aí em cima". Medido em 27/11/2026: a chave de
 * ONTEM, de outra cobrança, dezenas de balões acima, fez a agente dizer "é o número que chegou aí" — e a pessoa não achou.
 */
const FALAS_RECENTES = 10;

/** "manda a chave", "qual o pix?", "me passa a chave de novo". */
const PEDE_A_CHAVE =
  /\b(?:manda|mande|envia|envie|passa|passe|me\s+d[áa]|qual(?:\s+[ée])?|cad[êe])\b[^.!?\n]{0,25}?\b(?:chave|pix)\b/i;
/** "achei não", "manda aí" — pedido só quando a última fala da agente era sobre a chave. */
const NAO_ACHOU = /\b(?:achei|encontrei)\s+n[ãa]o\b|\bn[ãa]o\s+(?:achei|encontrei)\b|\b(?:manda|mande|envia|envie)\s+a[íi]\b/i;
const FALA_DA_CHAVE = /\b(?:chave|pix)\b/i;

type Fala = { direction: string; body?: string | null };

function cobrancaRecente(historico: readonly Fala[]): boolean {
  return historico
    .filter((m) => m.direction === "outbound")
    .slice(-FALAS_RECENTES)
    .some((m) => COBRANCA_ENVIADA.test(m.body ?? ""));
}

/**
 * A última leva de falas da pessoa pediu a chave? Pula os balões da agente no fim (os deste turno, como um "Claro, meu
 * bem." antes do balão que fala da chave); `cobrancaDesdeOPedido` diz se a chave já saiu entre eles.
 */
function pediuAChave(historico: readonly Fala[]): boolean {
  const dela: string[] = [];
  let i = historico.length - 1;
  while (i >= 0 && historico[i]!.direction === "outbound") i--;
  for (; i >= 0 && historico[i]!.direction !== "outbound"; i--) dela.push(historico[i]!.body ?? "");
  const ultimaDaAgente = i >= 0 ? (historico[i]!.body ?? "") : "";
  return dela.some((b) => PEDE_A_CHAVE.test(b) || (NAO_ACHOU.test(b) && FALA_DA_CHAVE.test(ultimaDaAgente)));
}

/**
 * `historico`: a conversa até aqui, em ordem, COM os balões já enviados neste turno (com a chave já trocada) — senão um
 * balão que fala da chave logo depois do balão da chave seria recusado.
 */
export function anunciaCobrancaSemCobranca(corpo: string, historico: readonly Fala[] = []): boolean {
  if (COBRANCA_NO_CORPO.test(corpo)) return false;
  if (ANUNCIO.some((r) => r.test(corpo))) return true;
  if (PERGUNTA_SE_COPIOU.test(corpo) || DIZ_QUE_JA_SAIU.test(corpo)) return !cobrancaRecente(historico);
  // PEDIU A CHAVE, A RESPOSTA QUE FALA DELA TRAZ A CHAVE: "manda a chave de novo" respondido com "é o número que já foi aí".
  if (FALA_DA_CHAVE.test(corpo) && pediuAChave(historico) && !cobrancaDesdeOPedido(historico)) return true;
  return false;
}

/** Uma cobrança já saiu depois do último pedido dela (no turno, por exemplo)? */
function cobrancaDesdeOPedido(historico: readonly Fala[]): boolean {
  for (let i = historico.length - 1; i >= 0; i--) {
    const m = historico[i]!;
    if (m.direction !== "outbound") return false;
    if (COBRANCA_ENVIADA.test(m.body ?? "")) return true;
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
