/**
 * A AGENTE NÃO DESCREVE UM PAGAMENTO QUE NÃO EXISTE.
 *
 * Medido em 01/11/2026, com a chave Pix como caminho principal: "No link você paga no Pix" saiu em 5 conversas, com um
 * link que só aceita cartão; "o sistema me avisa assim que cair" em 3, com uma chave que não confirma sozinha e depende
 * do comprovante; e "Conseguiu copiar o código?" a quem recebeu uma chave. O texto vinha do roteiro antigo, de quando o
 * pagamento era o Pix copia e cola da Stripe.
 *
 * Pura. Só vale para quem cobra pela chave.
 */
const LINK_COM_PIX = /\bno\s+link\b[^.?!\n]{0,50}\bpix\b/i;
const SISTEMA_AVISA = /\bsistema\s+(?:me\s+)?avisa\b/i;
const CODIGO_DO_PIX = /\bc[óo]digo(?:\s+do\s+pix)?\b/i;
const FALA_DE_COPIAR = /\b(?:copiar|copiou|colar|colou)\b/i;
/** O começo de todo código de Pix copia e cola. */
const CODIGO_ENVIADO = /00020126/;

/*
 * Medido em 02/11/2026 (Ana, uma hora sem conseguir pagar a entrada): "a chave vai aqui embaixo" e "a chave já está aí
 * em cima" 8 vezes sem chave nenhuma, "a chave é o CNPJ do nosso financeiro" com uma chave de celular, "esse número
 * não é a chave" sobre a própria chave, e "abre o link e coloca o valor de R$ 47" num link de valor fixo.
 */
/** Frases que dizem que a chave está aqui ou já foi mandada. Pergunta ("quer que eu mande a chave?") não conta. */
/** Início e fim de palavra que reconhecem letra acentuada: `\b` não vê fronteira depois de "é" ou "está". */
const palavras = (corpo: string): RegExp => new RegExp(corpo.replaceAll(String.raw`\b<`, String.raw`(?<![\p{L}\d])`).replaceAll(String.raw`\b>`, String.raw`(?![\p{L}\d])`), "iu");
const CHAVE_ENTREGUE = palavras(
  String.raw`\b<chave\b>[^.?!\n]{0,60}\b<(?:aqui embaixo|logo abaixo|abaixo|a seguir|é esta|é essa aqui|esta aqui|aí em cima|ali em cima|lá em cima|já (?:está|tá) aí|já (?:está|tá) ai)\b>|\b<(?:aqui (?:está|tá)|segue|te mandei|já mandei|já te mandei|mandei|enviei|já enviei)\b>[^.?!\n]{0,25}\b<chave\b>`,
);
/** Um balão que é só a chave (celular, CPF, CNPJ, e-mail ou aleatória), ou a instrução que o sistema escreve. */
const CHAVE_NA_CONVERSA = /^\s*(?:\+?\d{10,14}|[^\s@]+@[^\s@]+\.[^\s@]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\s*$|Pra pagar no Pix \(\*/im;
/** A cobrança que o sistema troca pela chave, escrita neste envio: a marca ou um link. */
const COBRANCA_NO_ENVIO = /\[\[\s*(?:CHAVE\s+)?PIX\b|https?:\/\//i;
const NEGA_A_CHAVE = palavras(String.raw`\b<(?:não|nao|nem)\s+(?:é|e)\s+(?:a\s+)?(?:sua\s+|nossa\s+)?chave\b>`);
const TIPO_INVENTADO = palavras(String.raw`\b<chave\b>[^.?!\n]{0,20}\b<(?:é|e|seria)\b>[^.?!\n]{0,15}\b<(?:cnpj|cpf|e-?mail|aleatória|aleatoria)\b>`);
const VALOR_NO_LINK =
  /\b(?:link|p[áa]gina)\b[^.?!\n]{0,80}\b(?:campo\s+(?:do|de)\s+valor|coloc\w*\s+o\s+valor|digit\w*\s+o\s+valor|coloc\w*\s+R\$|digit\w*\s+R\$)|\bcampo\s+(?:do|de)\s+valor\b/i;

const frases = (texto: string): string[] => texto.split(/(?<=[.?!])\s+|\n+/).filter((f) => !f.trim().endsWith("?"));

export function falaErradaDoPagamento(
  corpo: string,
  mensagens: ReadonlyArray<{ direction: string; body?: string | null }>,
): string | null {
  if (LINK_COM_PIX.test(corpo)) {
    return "O link é só de cartão: ele não aceita Pix. Reescreva dizendo que o Pix é pela chave e o link é para o cartão.";
  }
  const afirmacoes = frases(corpo).join("\n");
  if (CHAVE_ENTREGUE.test(afirmacoes) && !COBRANCA_NO_ENVIO.test(corpo)) {
    const chaveJaFoi = mensagens.some((m) => m.direction === "outbound" && CHAVE_NA_CONVERSA.test(m.body ?? ""));
    if (!chaveJaFoi) {
      return "Você ainda não mandou chave nenhuma nesta conversa: ela só chega pela cobrança. Para mandar agora, escreva a cobrança sozinha num balão (o link do produto ou a marca [[PIX: …]] do valor liberado neste turno). Se nenhum valor está liberado para o que ela quer, não diga que mandou: diga o valor que está liberado.";
    }
  }
  if (NEGA_A_CHAVE.test(corpo)) {
    return "O número que o sistema mandou sozinho no balão É a chave do Pix. Reescreva sem negar isso: se ela perguntar, diga que sim, é a chave.";
  }
  if (TIPO_INVENTADO.test(corpo)) {
    return "Não diga de que tipo é a chave por conta própria: o tipo certo está no bloco PIX PELA CHAVE DA EMPRESA. Reescreva sem dizer CNPJ, CPF, e-mail ou aleatória.";
  }
  if (VALOR_NO_LINK.test(corpo)) {
    return "O link do cartão tem o valor fixo do produto e não tem campo de valor. Reescreva sem mandar digitar ou trocar o valor no link: valor diferente (entrada, avulsa) é pela chave, com a marca [[PIX: …]].";
  }
  if (SISTEMA_AVISA.test(corpo)) {
    return "O sistema não avisa quando o Pix pela chave cai. Reescreva pedindo o comprovante aqui na conversa, para você conferir.";
  }
  // Depois de um copia e cola enviado, "código" é a palavra certa.
  const mandouCodigo = mensagens.some((m) => m.direction === "outbound" && CODIGO_ENVIADO.test(m.body ?? ""));
  if (!mandouCodigo && CODIGO_DO_PIX.test(corpo) && FALA_DE_COPIAR.test(corpo)) {
    return "Ela recebeu uma chave Pix, não um código. Reescreva dizendo \"chave\".";
  }
  return null;
}
