/**
 * A TAXA DA PLATAFORMA POR VENDA — o que a instalação recebe de cada venda paga numa conta conectada
 * ("Conectar com Stripe"). A Stripe a desconta na própria cobrança (`application_fee_amount`).
 *
 * Forma: valor fixo + percentual do valor da venda, com teto opcional. Ex.: R$ 0,99 + 1,5%, no máximo
 * R$ 9,90 — numa venda de R$ 105 dá R$ 2,57. O percentual existe porque um valor fixo trata igual a venda de
 * R$ 30 e a de R$ 3.000; o teto, para a venda grande não pagar uma taxa que pareça abuso.
 *
 * Os três números vêm do `.env` (`STRIPE_CONNECT_TAXA_*`, lidos em `taxa-da-instalacao.ts`). Sem I/O: a tela
 * importa este módulo.
 */

export interface RegraDaTaxa {
  /** Parte fixa, em centavos. */
  fixoCentavos: number;
  /** Parte percentual, em pontos-base (150 = 1,5%). */
  percentualBp: number;
  /** Teto da taxa, em centavos. 0 = sem teto. */
  tetoCentavos: number;
}

export const SEM_TAXA: RegraDaTaxa = { fixoCentavos: 0, percentualBp: 0, tetoCentavos: 0 };

export function regraTemTaxa(r: RegraDaTaxa): boolean {
  return r.fixoCentavos > 0 || r.percentualBp > 0;
}

/**
 * A taxa de uma venda pela regra, em centavos, ou `null` quando não vai: regra zerada, ou venda pequena
 * demais (a Stripe exige taxa positiva e MENOR que o valor — mandar igual ou maior faria a Stripe recusar a
 * cobrança inteira, e a pessoa ficaria sem como pagar).
 */
export function calcularTaxa(r: RegraDaTaxa, valorCentavos: number): number | null {
  if (!regraTemTaxa(r) || valorCentavos <= 0) return null;
  let taxa = r.fixoCentavos + Math.round((valorCentavos * r.percentualBp) / 10_000);
  if (r.tetoCentavos > 0) taxa = Math.min(taxa, r.tetoCentavos);
  return taxa > 0 && taxa < valorCentavos ? taxa : null;
}
