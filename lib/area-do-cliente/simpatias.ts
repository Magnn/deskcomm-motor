/**
 * AS SIMPATIAS DA ÁREA DO CLIENTE (pedido do dono em 19/10/2026; migration 0941).
 *
 * A equipe cadastra cada simpatia (título, intenção, materiais, passo a passo, cuidado). Na área, cada uma tem
 * duas saídas:
 *  - "faço eu mesma": o passo a passo — de quem está no Círculo, quando a empresa assim configurou;
 *  - "o templo faz por mim": um SERVIÇO pago à parte, com preço fixo. O pedido nasce antes do pagamento, o aviso
 *    da Stripe o marca como pago, e a equipe o marca como feito (com um recado) no painel. A área só promete o
 *    que o sistema garante: que o templo faz e avisa quando fez.
 *
 * A CONTRIBUIÇÃO é outra coisa, de propósito: valor livre, voluntário, que não libera nada. Chamar de "doação"
 * o pagamento de um serviço seria vender como doação o que é compra.
 *
 * Nenhum texto daqui promete resultado: simpatia fala em intenção e cuidado.
 */
import { z } from "zod";

/** Os marcadores que vão e voltam nos metadados do pagamento (`metadata.extra`). */
export const EXTRA_DA_SIMPATIA = "simpatia";
export const EXTRA_DA_CONTRIBUICAO = "contribuicao";

/** O teto da contribuição livre, em centavos (o mínimo é da configuração). */
export const CONTRIBUICAO_MAXIMA_CENTS = 100_000;

const camposDaSimpatia = {
  titulo: z.string().trim().min(1).max(80),
  intencao: z.string().trim().min(1).max(200),
  materiais: z.string().trim().max(600).nullable().optional(),
  passos: z.string().trim().min(1).max(4000),
  cuidado: z.string().trim().max(400).nullable().optional(),
  publicada: z.boolean(),
  posicao: z.number().finite(),
};

export const simpatiaSchema = z.strictObject({
  ...camposDaSimpatia,
  publicada: camposDaSimpatia.publicada.default(true),
  posicao: camposDaSimpatia.posicao.default(0),
});
/** A edição parcial NÃO herda os padrões (no Zod 4 o padrão vale mesmo com o campo ausente). */
export const simpatiaParcialSchema = z.strictObject(camposDaSimpatia).partial();
export type Simpatia = z.infer<typeof simpatiaSchema>;

export const COLUNAS_DA_SIMPATIA = "id, titulo, intencao, materiais, passos, cuidado, publicada, posicao, created_at, updated_at";
export const COLUNAS_DO_PEDIDO = "id, contact_id, simpatia_id, titulo, para_quem, valor_cents, pago_at, feita_at, nota, created_at";

/**
 * Quem vê o passo a passo. Sem o Círculo ligado na empresa, ou com `so_assinantes` desligado, todos veem; com os
 * dois ligados, só quem está com o Círculo em dia.
 */
export function vePassoAPasso(cfg: { so_assinantes?: boolean }, circuloLigado: boolean, noCirculo: boolean): boolean {
  if (!circuloLigado || cfg.so_assinantes === false) return true;
  return noCirculo;
}

export type EstadoDoPedido = "aguardando_pagamento" | "a_fazer" | "feita";

export function estadoDoPedido(p: { pago_at: string | null; feita_at: string | null }): EstadoDoPedido {
  if (p.feita_at) return "feita";
  return p.pago_at ? "a_fazer" : "aguardando_pagamento";
}

/** O valor livre da contribuição, validado: inteiro, entre o mínimo da empresa e o teto. */
export function valorDaContribuicaoValido(valorCents: number, minimoCents: number): boolean {
  return Number.isInteger(valorCents) && valorCents >= minimoCents && valorCents <= CONTRIBUICAO_MAXIMA_CENTS;
}
