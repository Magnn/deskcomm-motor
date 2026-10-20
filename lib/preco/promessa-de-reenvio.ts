/**
 * QUEM PROMETE REENVIAR O PAGAMENTO, REENVIA NA MESMA MENSAGEM.
 *
 * Medido em produção em 20/10/2026: a cliente disse que o banco não reconhecia o código ("pode me enviar
 * novamente?"), a agente respondeu "Vou te mandar de novo agora, Claudia. Copia esse código inteiro…" — e não
 * mandou código nenhum. A cliente respondeu "blz" e ficou esperando; a venda de R$ 5 parou ali.
 *
 * A regra: a mensagem que promete mandar o pagamento de novo ("vou te mandar de novo", "te reenvio", "segue
 * novamente") tem de trazer a cobrança junto — a marca de cobrança (`[[PIX: …]]`, `[[COBRAR: …]]`) ou um link.
 * Sem isso, o envio é recusado e o motivo volta ao modelo, que reescreve.
 *
 * Pura.
 */

/**
 * A promessa: enviar "de novo / novamente / outra vez", "reenviar", ou o futuro de quem promete a cobrança ("vou
 * preparar o pagamento", "já te mando o boleto") — medido na mesma tarde: "Vou preparar o pagamento da entrada no seu
 * nome agora", e nada saiu.
 */
const PROMESSA =
  /\b(?:(?:mand|envi|pass)\w*(?:\s+\S+){0,3}?\s+(?:de\s+novo|novamente|outra\s+vez)|reenvi\w*|(?:vou|j[áa])\s+(?:te\s+|lhe\s+)?(?:preparar|gerar|emitir|mandar|mando|enviar|envio|passar|passo)(?:\s+\S+){0,3}?\s+(?:pagamento|pix|c[óo]digo|link|boleto|cobran[çc]a|qr))/i;
/** Do que a promessa fala: o pagamento, e não outra coisa ("te mando de novo a oração"). */
const DO_PAGAMENTO = /\b(?:pix|c[óo]digo|link|pagamento|qr|cobran[çc]a|chave|boleto)\b/i;
/** A cobrança de fato: a marca que o sistema troca pelo Pix, ou um link. */
const COBRANCA = /\[\[\s*(?:PIX|COBRAR)\s*:|https?:\/\//i;

/** O motivo da recusa quando a mensagem promete reenviar o pagamento sem trazê-lo; `null` quando está tudo certo. */
export function promessaDeReenvioSemCobranca(corpo: string): string | null {
  if (!PROMESSA.test(corpo) || !DO_PAGAMENTO.test(corpo)) return null;
  if (COBRANCA.test(corpo)) return null;
  return (
    "Você disse que ia mandar o pagamento de novo, mas esta mensagem não traz a cobrança. NÃO prometa reenviar: " +
    "mande AGORA, nesta mesma mensagem, a marca de cobrança (a mesma que você usou antes, ex.: [[PIX: Pergunta nova]]) " +
    "numa linha sozinha depois do texto. Se o problema foi o banco não reconhecer o código, diga em uma frase que é para " +
    "colar na opção Pix Copia e Cola (não no campo de chave), ou para abrir o link e escolher Pix."
  );
}
