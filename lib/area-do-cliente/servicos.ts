/**
 * Um serviço da vitrine da área do cliente, como a equipe o cadastra.
 * Comprar leva ao `link_checkout`; a compra volta pelo ledger de receita e o
 * painel a liga ao serviço pelo NOME do produto pago — por isso o nome aqui
 * deve ser o mesmo do checkout.
 */
import { z } from "zod";

import { etapasSchema } from "./etapas";

/** Os campos sem valor padrão: é deles que sai o PATCH parcial. */
const camposDoServico = {
  nome: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(600).optional().nullable(),
  recebe: z.string().trim().max(300).optional().nullable(),
  preco_cents: z.number().int().min(100).max(10_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  link_checkout: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), "o link de pagamento precisa começar com https://"),
  destaque: z.boolean(),
  ativo: z.boolean(),
  posicao: z.number().finite(),
  /** As etapas do trabalho, na ordem (aparecem na área de quem comprou). */
  etapas: etapasSchema,
};

export const servicoDaAreaSchema = z.strictObject({
  ...camposDoServico,
  currency: camposDoServico.currency.default("BRL"),
  destaque: camposDoServico.destaque.default(false),
  ativo: camposDoServico.ativo.default(true),
  posicao: camposDoServico.posicao.default(0),
  etapas: camposDoServico.etapas.default([]),
});
export type ServicoDaArea = z.infer<typeof servicoDaAreaSchema>;

/**
 * A edição parcial NÃO herda os valores padrão: no Zod 4 um padrão dentro de um
 * campo opcional é aplicado mesmo quando o campo não veio, e mudar só o preço
 * desligava o destaque, reativava o serviço pausado e apagava as etapas.
 */
export const servicoDaAreaParcialSchema = z.strictObject(camposDoServico).partial();

export const COLUNAS_DO_SERVICO =
  "id, nome, descricao, recebe, preco_cents, currency, link_checkout, destaque, ativo, posicao, etapas, created_at, updated_at";
