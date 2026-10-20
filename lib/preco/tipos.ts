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
/** Quantas ofertas podem vir DEPOIS da primeira oferta de pós-venda. */
export const MAX_OFERTAS_SEGUINTES = 3;

/**
 * Uma oferta que só aparece depois que a anterior foi COMPRADA — a sequência de pós-venda
 * ("comprou o trabalho → oferece A; comprou A → oferece B"). Cada uma tem o seu valor: o link de
 * cada produto cobra um preço, e a agente só pode dizer o que o link cobra.
 */
export const ofertaSeguinteSchema = z.object({
  price_cents: centavos,
  /** Horas depois da compra da oferta anterior. */
  wait_hours: z.number().int().min(0).max(720).default(1),
  product_links: z.array(linkPorProdutoSchema).min(1).max(MAX_LINKS_POR_PRODUTO),
});

export const ofertaPosVendaSchema = z.object({
  enabled: z.boolean().default(false),
  price_cents: centavos,
  wait_hours: z.number().int().min(0).max(720).default(ESPERA_PADRAO_DO_POS_VENDA_H),
  product_links: z.array(linkPorProdutoSchema).min(1).max(MAX_LINKS_POR_PRODUTO),
  /** Em ordem: cada uma só é oferecida depois que a anterior foi comprada. */
  next_offers: z.array(ofertaSeguinteSchema).max(MAX_OFERTAS_SEGUINTES).optional(),
});
export type OfertaPosVenda = z.infer<typeof ofertaPosVendaSchema>;

/** As moedas em que dá para vender a quem escreve de fora do país (`preco-internacional.ts`). */
export const MOEDAS_INTERNACIONAIS = ["EUR", "USD"] as const;
export type MoedaInternacional = (typeof MOEDAS_INTERNACIONAIS)[number];

/**
 * O preço para quem escreve de FORA do Brasil, por moeda. É FIXO: não tem degrau, entrada nem cupom — o
 * link em reais não serve a essa pessoa, e o que ela paga é uma cobrança criada na moeda dela.
 */
export const precoInternacionalSchema = z.object({
  currency: z.enum(MOEDAS_INTERNACIONAIS),
  price_cents: centavos,
});
export type PrecoInternacional = z.infer<typeof precoInternacionalSchema>;

/**
 * Quantas cobranças avulsas um agente pode ter. Era 6; em 20/10/2026 o dono pediu uma simpatia para cada dor que a
 * conversa traz (amor novo, corte de laços, prosperidade, proteção, caminhos, paz em casa, amor-próprio), além da
 * pergunta, da sinastria e do acompanhamento. Cada uma custa uma linha no bloco do turno, não mais.
 */
export const MAX_EXTRAS = 12;

/**
 * COBRANÇA AVULSA: algo que o agente vende à parte do produto principal, por um valor próprio — uma pergunta
 * nova, um acompanhamento mais próximo. Não tem link de checkout: o agente pede a cobrança e o sistema gera o
 * Pix na conversa (`lib/preco/extras.ts`). `when` diz ao agente em que situação cobrar.
 */
export const extraSchema = z.object({
  name: z.string().trim().min(2).max(60),
  price_cents: centavos,
  when: z.string().trim().min(5).max(400),
  /**
   * Por quantos dias o pagamento vale. Ausente = uma entrega (uma pergunta). Com dias, é um período: quem pagou é
   * atendido sem nova cobrança até o fim dele (um acompanhamento de 30 dias).
   */
  valid_days: z.number().int().min(1).max(366).optional(),
  /**
   * Como entregar depois de pago: o que pedir à pessoa e o que fazer. Sem isto, o agente só sabe que foi pago e
   * improvisa a entrega. Ausente = "entregue o que ela pagou, completo".
   */
  delivery: z.string().trim().min(5).max(600).optional(),
  /**
   * A entrega é uma NOVA LEITURA DE 3 CARTAS pelo motor da leitura (`lib/leitura/estado-da-leitura.ts`): depois do
   * pagamento, a pessoa escolhe 3 números, o código sorteia, a agente revela uma carta por vez (com a foto) e
   * responde a pergunta. Ausente = vale para a cobrança com "pergunta" no nome (`abreLeitura`).
   */
  opens_reading: z.boolean().optional(),
  /**
   * A entrega é um relatório em PDF gerado sob medida depois do pagamento (`lib/preco/relatorio-pronto.ts`).
   * `sinastria` calcula os dois mapas a partir das datas de nascimento; `leitura` escreve a partir do que a
   * pessoa contou. Com isto, o `delivery` é montado pelo sistema.
   */
  report: z
    .object({
      kind: z.enum(["sinastria", "leitura"]),
      /** O título na capa. Ausente = o nome do extra. */
      title: z.string().trim().min(3).max(60).optional(),
      /** O que este produto entrega e em que tom, para quem escreve o relatório. */
      guidance: z.string().trim().min(10).max(800).optional(),
    })
    .optional(),
});
export type Extra = z.infer<typeof extraSchema>;

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
    /**
     * Os links de pagamento do VALOR DE VENDA, um por produto. Os degraus já tinham os seus; o valor cheio
     * só existia no texto do roteiro, e o código não tinha como saber que link cobra quanto.
     */
    list_product_links: z.array(linkPorProdutoSchema).max(MAX_LINKS_POR_PRODUTO).optional(),
    /** Preço fixo para quem escreve de fora do Brasil, um por moeda. Ausente = todo mundo paga em reais. */
    international_prices: z.array(precoInternacionalSchema).max(MOEDAS_INTERNACIONAIS.length).optional(),
    /** O que o agente cobra à parte do produto principal, por Pix na conversa. Ausente = nada é cobrado à parte. */
    extras: z.array(extraSchema).max(MAX_EXTRAS).optional(),
    /**
     * Quantas vezes o agente responde de graça, depois de apresentar a oferta, a quem não comprou e fala de outra
     * coisa que não a compra (`lib/agent-engine/agent/conversa-gratuita.ts`). Ausente = sem limite.
     */
    free_replies_after_offer: z.number().int().min(1).max(20).optional(),
    /**
     * A menor entrada que o agente aceita quando a pessoa diz quanto consegue pagar agora. Ausente = o menor degrau
     * da escada. A entrada paga inicia a entrega do produto inteiro, então este é o menor valor por que ele sai.
     */
    min_down_payment_cents: centavos.optional(),
    /**
     * A chave Pix da própria empresa, para quem pede "o número da chave" (`lib/preco/chave-pix.ts`). O dinheiro cai
     * direto na conta, mas a confirmação é manual. Ausente = só o Pix do provedor.
     */
    pix_key: z
      .object({
        key: z.string().trim().min(5).max(80),
        /** O nome de quem recebe, como aparece no banco. */
        holder: z.string().trim().min(2).max(60),
        city: z.string().trim().max(30).optional(),
      })
      .optional(),
    /**
     * Áudios de depoimento de clientes, enviados uma vez por conversa logo depois da mensagem que diz o preço
     * (`lib/preco/prova-social.ts`). Os arquivos ficam em `whatsapp-media/<org>/provas/`. Ausente = nada é enviado.
     */
    social_proof: z
      .object({
        audios: z
          .array(
            z.object({
              storage_path: z.string().trim().min(3).max(300),
              mime: z.string().trim().regex(/^audio\//),
              /** O que o áudio diz, em uma linha: vai para o histórico, para o agente saber o que a pessoa ouviu. */
              descricao: z.string().trim().min(3).max(240),
            }),
          )
          .max(6),
      })
      .optional(),
    /** O modelo que escreve os relatórios sob medida. Ausente = o modelo do agente. */
    report_model: z.string().trim().min(2).max(80).optional(),
    /**
     * A cobrança sai SÓ pelo provedor de pagamento conectado: os links de pagamento desta configuração viram a
     * marca do que cobrar, e a pessoa recebe o Pix e o link de cartão do provedor — nunca o link externo
     * (`lib/agent-engine/agent/cobranca-pelo-provedor-no-envio.ts`). Ausente = o link externo segue saindo.
     */
    provider_only_checkout: z.boolean().optional(),
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
    (c.international_prices ?? []).forEach((p, i, todos) => {
      if (todos.findIndex((o) => o.currency === p.currency) !== i) {
        ctx.addIssue({ code: "custom", path: ["international_prices", i, "currency"], message: "cada moeda só pode ter um preço" });
      }
    });
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
  if (!c.post_sale?.enabled) return daEscada;
  // As ofertas seguintes entram no piso pelo mesmo motivo da primeira: a trava de promessas da
  // organização vetaria um valor que a própria tela configurou.
  return Math.min(daEscada, c.post_sale.price_cents, ...(c.post_sale.next_offers ?? []).map((o) => o.price_cents));
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
