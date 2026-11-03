/**
 * A ENTRADA PELO PLANO DE 7 DIAS — a porta do funil vendida direto na página (migration 0955).
 *
 * Pedido do dono em 03/11/2026: quem ainda não tem área compra 7 dias do plano por R$ 5 / US$ 1 / € 1 (os preços do
 * Plano da Semana, `plano-semanal.ts`) e ganha créditos de boas-vindas para usar dentro do app. O pedido nasce antes
 * do pagamento; o aviso da Stripe estende o plano, marca o pedido e credita as boas-vindas; quem pagou entra na área
 * pelo segredo do pedido, como nos quizzes (`entrada-pela-compra.ts`).
 *
 * UMA ENTRADA POR PESSOA: o preço de porta é para quem chega. Quem já teve plano (ou já pagou uma entrada) é mandado
 * para a área, onde o plano segue no preço da área. A entrada NÃO guarda o cartão e NÃO renova sozinha: continuar
 * depois dos 7 dias é uma escolha que ela faz na área, com o preço à vista.
 *
 * Pura.
 */
import { z } from "zod";

export const FOCOS_DA_ENTRADA = ["amor", "dinheiro", "caminhos", "eu"] as const;
export type FocoDaEntrada = (typeof FOCOS_DA_ENTRADA)[number];

/** Os créditos de boas-vindas quando a empresa não muda (1 crédito = R$ 1 no preço de tabela). */
export const CREDITOS_DE_BOAS_VINDAS_PADRAO = 20;

/** A referência do crédito de boas-vindas: UMA por pessoa, para sempre — a função do banco recusa a repetida. */
export function referenciaDasBoasVindas(contactId: string): string {
  return `boas-vindas-${contactId}`;
}

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const pedidoDeEntradaSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  /** A carta do dia, o céu e o horóscopo da área partem dela; sem ela a área funciona, mas fala menos dela. */
  nascimento: data.optional(),
  foco: z.enum(FOCOS_DA_ENTRADA),
  forma: z.enum(["pix", "cartao"]),
  /** A moeda que a página propôs pelo fuso; o valor sai do plano, no servidor (`moeda-do-visitante.ts`). */
  moeda: z.enum(["BRL", "USD", "EUR"]).default("BRL"),
});
export type PedidoDeEntrada = z.infer<typeof pedidoDeEntradaSchema>;

/** A data é de verdade e a pessoa tem entre 18 e 110 anos (a área é para maiores de 18). */
export function nascimentoAceito(iso: string, hoje: Date = new Date()): boolean {
  const [a, m, d] = iso.split("-").map(Number);
  const nasc = new Date(Date.UTC(a!, m! - 1, d!));
  if (nasc.getUTCFullYear() !== a || nasc.getUTCMonth() !== m! - 1 || nasc.getUTCDate() !== d) return false;
  const idade = (hoje.getTime() - nasc.getTime()) / (365.25 * 86_400_000);
  return idade >= 18 && idade <= 110;
}

/**
 * Pode comprar a entrada? Só quem nunca teve plano nem pagou uma entrada. Quem já teve é mandado para a área.
 */
export function podeComprarAEntrada(h: { jaTevePlano: boolean; jaPagouEntrada: boolean }): boolean {
  return !h.jaTevePlano && !h.jaPagouEntrada;
}
