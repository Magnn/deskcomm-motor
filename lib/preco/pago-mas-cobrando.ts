/**
 * PAGOU, MAS A AGENTE CONTINUA COBRANDO — a trava no envio para a cobrança avulsa que acabou de cair.
 *
 * O bloco do turno já diz "PAGAMENTO CONFIRMADO PELO SISTEMA… comece a entrega AGORA" (`blocoDosExtras`, em
 * `extras.ts`), e o turno do pagamento é acordado na hora (`aviso-de-pagamento-da-stripe.ts`). Mesmo assim o
 * modelo às vezes ignora a linha. Medido em 21/10/2026, em 4 de 5 pagamentos de pergunta nova (R$ 5): com o Pix já
 * pago, a agente seguiu ensinando a copiar o código, dizendo "ainda não apareceu" ou "deixa eu conferir". A pessoa
 * pagou e ouviu que não tinha pago.
 *
 * A regra: com uma entrega pendente (pago há pouco, nenhuma fala nossa depois), a mensagem que fala de pagar,
 * conferir ou esperar o pagamento é recusada, e a instrução volta ao modelo para ele reescrever confirmando e
 * entregando. Pura.
 */

const AINDA_COBRANDO =
  /copi(e|ar|a o)|copia e cola|colar? (o c[óo]digo|na op[çc][ãa]o|ali)|chave pix|(em|na|no campo da?) chave|c[óo]digo do pix|o pix (j[áa] )?(est[áa]|t[áa]) a[íi]|link (do cart[ãa]o|de pagamento)|ainda n[ãa]o (caiu|apareceu|confirmou|chegou|entrou)|confer(ir|indo) (aqui|o pagamento|o seu|pra voc)|deixa eu conferir|assim que (cair|o pagamento|pagar|confirmar)|comprovante|\[\[\s*(PIX|COBRAR)\s*:/i;

/** O texto age como se a pessoa ainda devesse o pagamento. */
export function falaComoSeNaoTivessePago(corpo: string): boolean {
  return AINDA_COBRANDO.test(corpo);
}

/**
 * `null` = pode enviar. Texto = o envio é recusado e isto volta ao modelo. `pendente` é a entrega que o turno
 * calculou (`entregaPendente`); sem ela, nada a travar.
 */
export function recusaDeQuemJaPagou(
  corpo: string,
  pendente: { extra: { name: string }; minutos: number } | null,
): string | null {
  if (pendente === null || !falaComoSeNaoTivessePago(corpo)) return null;
  const ha = pendente.minutos < 1 ? "agora mesmo" : `há ${pendente.minutos} min`;
  return (
    `O pagamento de *${pendente.extra.name}* JÁ CAIU: o sistema confirmou ${ha}. NÃO fale de pagar, código, chave, link, ` +
    "comprovante, conferir nem de esperar o pagamento. Reescreva: comece com meia frase dizendo que o Pix caiu e faça a " +
    "entrega agora, nesta resposta."
  );
}
