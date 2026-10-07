/**
 * PREÇO E NEGOCIAÇÃO DO AGENTE — o que o operador define e o que a agente pode fazer com isso.
 *
 * O operador declara TRÊS coisas por agente:
 *   • valor de venda   — o que o link de pagamento cobra;
 *   • valor de referência (opcional) — o preço "cheio", citado como referência;
 *   • degraus de negociação (opcionais) — cada um com o valor e COMO se paga esse valor
 *     (um cupom do checkout ou um link próprio). O ÚLTIMO degrau é o MÍNIMO: a agente
 *     nunca desce dele.
 *
 * ─── Por que o degrau carrega o cupom/link ──────────────────────────────────────────
 * A agente não muda o que o checkout cobra. Se ela dissesse "fica R$ 110" e o link
 * cobrasse R$ 130, a pessoa pagaria o valor errado ou desistiria — e o que foi prometido
 * na conversa é o que ela espera pagar. Um valor negociável só existe se existe a forma
 * de pagá-lo; por isso o schema recusa degrau sem cupom nem link.
 *
 * ─── Onde a configuração mora ───────────────────────────────────────────────────────
 * Em `ai_agents.config.pricing` (jsonb, o mesmo lugar de `voice_reply`), e é escrita SÓ
 * por `PUT /api/v1/ai/agents/:id/pricing` — que também liga o PISO na trava de promessas
 * (`promise_table`), a rede de segurança que veta a mensagem se o modelo citar um valor
 * abaixo do mínimo. A rota genérica de PATCH do agente não escreve esta chave.
 */
import { z } from "zod";

const centavos = z.number().int().min(100).max(10_000_000);

/**
 * Link que já cobra o valor do degrau, POR PRODUTO. Serve a quem vende vários produtos no mesmo
 * agente (cada um com o seu link de oferta): a agente manda só o link do produto que indicou.
 */
export const linkPorProdutoSchema = z.object({
  name: z.string().trim().min(1).max(80),
  url: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((u) => u.startsWith("https://"), "o link precisa ser https"),
});
export type LinkPorProduto = z.infer<typeof linkPorProdutoSchema>;

export const MAX_LINKS_POR_PRODUTO = 12;

export const degrauDeNegociacaoSchema = z
  .object({
    price_cents: centavos,
    /** Cupom que a pessoa digita no checkout. Letras, números, - e _. */
    coupon_code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/, "use só letras, números, - e _")
      .optional(),
    /** Link de pagamento que já cobra este valor. */
    payment_url: z
      .string()
      .trim()
      .url()
      .max(300)
      .refine((u) => u.startsWith("https://"), "o link precisa ser https")
      .optional(),
    /** Um link por produto, quando cada produto tem o seu. Vale no lugar do `payment_url`. */
    product_links: z.array(linkPorProdutoSchema).max(MAX_LINKS_POR_PRODUTO).optional(),
  })
  .refine(
    (d) => d.coupon_code !== undefined || d.payment_url !== undefined || (d.product_links?.length ?? 0) > 0,
    { message: "informe o cupom ou o link que cobra este valor" },
  );
export type DegrauDeNegociacao = z.infer<typeof degrauDeNegociacaoSchema>;

/**
 * Seis: o dono do produto pediu uma escada de R$ 100 a R$ 50, de dez em dez (07/10/2026). Com
 * três, a agente que tinha mais valores combinados chamava uma pessoa para mandar o link à mão.
 * Cada degrau custa UMA reclamação de valor, então a escada maior não acelera a descida.
 */
export const MAX_DEGRAUS = 6;

/** Espera padrão entre o pagamento e a segunda oferta: "no dia seguinte". */
export const ESPERA_PADRAO_DO_POS_VENDA_H = 20;

/**
 * Oferta de PÓS-VENDA: um segundo produto, por outro valor, para quem já pagou. Só vale depois
 * de `wait_hours` do pagamento, e nunca para o produto que a pessoa já comprou — a regra mora
 * em `pos-venda.ts`. Exige link porque é a mesma lei dos degraus: valor que a agente pode
 * dizer só existe com a forma de pagá-lo.
 */
export const ofertaPosVendaSchema = z.object({
  enabled: z.boolean().default(false),
  price_cents: centavos,
  wait_hours: z.number().int().min(0).max(720).default(ESPERA_PADRAO_DO_POS_VENDA_H),
  product_links: z.array(linkPorProdutoSchema).min(1).max(MAX_LINKS_POR_PRODUTO),
});
export type OfertaPosVenda = z.infer<typeof ofertaPosVendaSchema>;

export const pricingSchema = z
  .object({
    enabled: z.boolean().default(false),
    /** O valor real de venda. */
    list_price_cents: centavos,
    /** O preço cheio de referência. Só vale com a declaração `anchor_is_real`. */
    anchor_price_cents: centavos.optional(),
    /**
     * Declaração de quem configura: este valor de referência é um preço que a oferta tem
     * (ou teve) de verdade. Um "de R$ X por R$ Y" cujo X nunca foi praticado é desconto
     * falso — publicidade enganosa (CDC, art. 37). A tela pede a marcação e a rota recusa
     * sem ela.
     */
    anchor_is_real: z.boolean().optional(),
    /** Do maior para o menor; o último é o mínimo. */
    steps: z.array(degrauDeNegociacaoSchema).max(MAX_DEGRAUS).default([]),
    /** O que oferecer a quem já comprou. Ausente = a agente não faz segunda oferta. */
    post_sale: ofertaPosVendaSchema.optional(),
  })
  .superRefine((c, ctx) => {
    if (c.anchor_price_cents !== undefined) {
      if (c.anchor_price_cents <= c.list_price_cents) {
        ctx.addIssue({
          code: "custom",
          path: ["anchor_price_cents"],
          message: "o valor de referência precisa ser MAIOR que o valor de venda",
        });
      }
      if (c.anchor_is_real !== true) {
        ctx.addIssue({
          code: "custom",
          path: ["anchor_is_real"],
          message: "confirme que o valor de referência é um preço real da oferta",
        });
      }
    }
    let anterior = c.list_price_cents;
    c.steps.forEach((s, i) => {
      if (s.price_cents >= anterior) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", i, "price_cents"],
          message:
            i === 0
              ? "o primeiro degrau precisa ser MENOR que o valor de venda"
              : "cada degrau precisa ser MENOR que o anterior",
        });
      }
      anterior = s.price_cents;
    });
  });
export type PricingConfig = z.infer<typeof pricingSchema>;

/**
 * O mínimo que a agente pode chegar: o último degrau, ou o próprio valor de venda — e, com a
 * oferta de pós-venda ligada, o valor dela quando for menor. É este número que vira o piso da
 * trava de promessas da organização: se o pós-venda ficasse de fora, a oferta mais barata que
 * a escada seria vetada por uma trava que a própria tela ligou.
 */
export function pisoEmCentavos(c: Pick<PricingConfig, "list_price_cents" | "steps"> & Pick<Partial<PricingConfig>, "post_sale">): number {
  const ultimo = c.steps[c.steps.length - 1];
  const daEscada = ultimo ? ultimo.price_cents : c.list_price_cents;
  return c.post_sale?.enabled ? Math.min(daEscada, c.post_sale.price_cents) : daEscada;
}

/** "R$ 130" quando redondo, "R$ 129,90" quando não. */
export function reais(cents: number): string {
  const inteiro = Math.floor(cents / 100);
  const resto = cents % 100;
  return resto === 0 ? `R$ ${inteiro}` : `R$ ${inteiro},${String(resto).padStart(2, "0")}`;
}

/**
 * Lê `config.pricing` de um jsonb solto SEM lançar. Shape estranho ou desligado vira `null`
 * — e sem configuração de preço o turno segue como sempre: a agente NÃO negocia.
 */
export function lerPricing(config: unknown): PricingConfig | null {
  if (config === null || typeof config !== "object") return null;
  const bruto = (config as Record<string, unknown>).pricing;
  if (bruto === undefined || bruto === null) return null;
  const r = pricingSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
