/**
 * Um serviço da vitrine da área do cliente, como a equipe o cadastra.
 * Comprar leva ao `link_checkout`; a compra volta pelo ledger de receita e o
 * painel a liga ao serviço pelo NOME do produto pago — por isso o nome aqui
 * deve ser o mesmo do checkout.
 */
import { z } from "zod";

export const servicoDaAreaSchema = z.strictObject({
  nome: z.string().trim().min(1).max(80),
  descricao: z.string().trim().max(600).optional().nullable(),
  recebe: z.string().trim().max(300).optional().nullable(),
  preco_cents: z.number().int().min(100).max(10_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/).default("BRL"),
  link_checkout: z
    .string()
    .trim()
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), "o link de pagamento precisa começar com https://"),
  destaque: z.boolean().default(false),
  ativo: z.boolean().default(true),
  posicao: z.number().finite().default(0),
});
export type ServicoDaArea = z.infer<typeof servicoDaAreaSchema>;

export const servicoDaAreaParcialSchema = servicoDaAreaSchema.partial();

export const COLUNAS_DO_SERVICO =
  "id, nome, descricao, recebe, preco_cents, currency, link_checkout, destaque, ativo, posicao, created_at, updated_at";
