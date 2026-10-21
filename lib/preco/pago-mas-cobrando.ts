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
 * Diz que o pagamento ainda NÃO está confirmado ("ainda não caiu", "a confirmação chega sozinha", "preciso ver o
 * pagamento cair"). Medido em 21/10/2026: a cliente pagou às 12h03 e a agente passou 15 minutos dizendo que a
 * confirmação ainda não tinha aparecido — a trava da entrega pendente só olhava a primeira mensagem.
 */
const DIZ_QUE_NAO_CAIU =
  /ainda n[ãa]o.{0,60}(pagamento|pix|confirma|caiu|apareceu|chegou|entrou)|preciso ver o pagamento|(a|essa) confirma[çc][ãa]o (ainda|do (seu )?pix|chega|cai|aparece|vai)|assim que (a confirma[çc][ãa]o|o pix|o pagamento|cair|confirmar)|n[ãa]o (consigo|d[áa] pra) abrir (isso |isto |a imagem )?como comprovante|esperando (o pagamento|a confirma[çc][ãa]o|cair)/i;

/** O texto diz que o pagamento ainda não foi confirmado. */
export function dizQueNaoCaiu(corpo: string): boolean {
  return DIZ_QUE_NAO_CAIU.test(corpo);
}

/** Por quanto tempo depois do pagamento a agente não pode dizer que ele não caiu. */
export const MINUTOS_EM_QUE_O_PAGAMENTO_E_FATO = 120;

/**
 * `null` = pode enviar. Texto = o envio é recusado e isto volta ao modelo.
 *   • `pendente` (a entrega que o turno calculou, `entregaPendente`): nada de falar em pagar, código, link ou conferir;
 *   • `pagoRecente` (a cobrança avulsa paga há até 2 h): nada de dizer que o pagamento ainda não caiu — mesmo depois
 *     da primeira mensagem. Uma cobrança NOVA (outra pergunta) continua permitida.
 */
export function recusaDeQuemJaPagou(
  corpo: string,
  pendente: { extra: { name: string }; minutos: number } | null,
  pagoRecente: { extra: { name: string }; minutos: number } | null = null,
): string | null {
  const caso =
    pendente !== null && (falaComoSeNaoTivessePago(corpo) || dizQueNaoCaiu(corpo))
      ? pendente
      : pagoRecente !== null && pagoRecente.minutos <= MINUTOS_EM_QUE_O_PAGAMENTO_E_FATO && dizQueNaoCaiu(corpo)
        ? pagoRecente
        : null;
  if (caso === null) return null;
  const ha = caso.minutos < 1 ? "agora mesmo" : `há ${caso.minutos} min`;
  return (
    `O pagamento de *${caso.extra.name}* JÁ CAIU: o sistema confirmou ${ha}. NÃO diga que ainda não caiu, NÃO fale de pagar, ` +
    "código, chave, link, comprovante, conferir nem de esperar a confirmação. Reescreva: diga em meia frase que o Pix caiu e " +
    "faça a entrega agora, nesta resposta (se já entregou, siga a conversa)."
  );
}
