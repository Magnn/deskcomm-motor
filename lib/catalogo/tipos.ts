/**
 * O CATÁLOGO DO AGENTE — o que a empresa vende a quem JÁ comprou, um registro por produto.
 *
 * ─── O defeito que fez este arquivo existir ─────────────────────────────────────────────────────
 * Um produto a mais morava em cinco lugares: o roteiro (a fala da oferta), a aba Preço (um valor e uma
 * lista de links), o nome de um fluxo "Entrega — …", a marca `produto:<nome>` no contato e o checkout.
 * Cada produto novo era uma edição em cada um deles, e o que divergia saía para o cliente: em
 * 09/10/2026 a agente ofereceu dois produtos que não existiam no checkout.
 *
 * Aqui o produto é UM registro com os mesmos campos: o que é, o que a pessoa recebe, quanto custa, por
 * onde paga, como é entregue, o que precisa ser pedido a ela e depois de qual compra ele é oferecido.
 * O código escolhe a oferta DA VEZ (`oferta-da-vez.ts`) e o roteiro não cita produto nenhum.
 *
 * ─── O que NÃO está aqui, e por quê ─────────────────────────────────────────────────────────────
 *   • O produto da PRIMEIRA venda. Valor, referência e escada de negociação continuam na aba Preço
 *     (`config.pricing`): negociar é uma regra por conversa, não um campo de produto.
 *   • As ofertas de pós-venda da aba Preço (`pricing.post_sale`). Com o catálogo LIGADO elas deixam de
 *     valer — o turno lê o catálogo no lugar. Uma verdade só: nunca as duas ao mesmo tempo.
 *
 * ─── Só o que tem entrega ───────────────────────────────────────────────────────────────────────
 * `entrega` é vocabulário FECHADO, e só entra nele o tipo que o motor sabe entregar:
 *   • `material` — arquivo ou sequência pronta, igual para todos. Sai por um fluxo de entrega que
 *                  declara o produto no gatilho;
 *   • `conversa` — a agente conduz a entrega na própria conversa (uma leitura, por exemplo), pedindo
 *                  antes o que estiver em `pede`.
 * Tipo novo (relatório calculado, ciclo de assinatura) entra aqui no mesmo PR em que ganhar motor.
 *
 * ─── Onde mora ──────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.catalog` (jsonb, o mesmo lugar de `pricing` e `offer`), escrito SÓ por
 * `PUT /api/v1/ai/agents/:id/catalogo`, e vale no PRÓXIMO turno, sem publicar versão.
 */
import { z } from "zod";

import { slugDoProduto } from "@/lib/preco/pos-venda";

export const MAX_PRODUTOS_DO_CATALOGO = 12;
export const MAX_DADOS_A_PEDIR = 6;

/** Espera padrão entre a compra anterior e a oferta: "no dia seguinte". */
export const ESPERA_PADRAO_DO_CATALOGO_H = 20;

export const TIPOS_DE_ENTREGA = ["material", "conversa"] as const;
export type TipoDeEntrega = (typeof TIPOS_DE_ENTREGA)[number];

const centavos = z.number().int().min(100).max(10_000_000);
const textoCurto = (max: number) => z.string().trim().min(1).max(max);

/** Um dado a pedir: sem aspas duplas, ponto e vírgula nem quebra de linha (o bloco junta com "; "). */
const dado = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine((v) => !v.includes('"') && !v.includes("\n") && !v.includes(";"), "sem aspas duplas, ponto e vírgula nem quebra de linha");

export const produtoDoCatalogoSchema = z.strictObject({
  /** Como o produto se chama para a pessoa — e no checkout. Único dentro do catálogo. */
  nome: textoCurto(80),
  /** O que é, numa ou duas frases. */
  descricao: textoCurto(300).optional(),
  /** O que a pessoa recebe ao pagar. */
  recebe: textoCurto(200).optional(),
  /** O que o link cobra. */
  preco_cents: centavos,
  /** O link que cobra este valor. */
  link: z
    .string()
    .trim()
    .url()
    .max(300)
    .refine((u) => u.startsWith("https://"), "o link precisa ser https"),
  entrega: z.enum(TIPOS_DE_ENTREGA),
  /** O que a agente pede à pessoa antes de entregar (data de nascimento, uma foto…). */
  pede: z.array(dado).max(MAX_DADOS_A_PEDIR).default([]),
  /**
   * O produto cuja compra libera esta oferta. Ausente = qualquer compra libera. Pode ser um produto
   * deste catálogo ou o da primeira venda: o que conta é a marca `produto:<nome>` do contato.
   */
  depois_de: textoCurto(80).optional(),
  /** Horas depois da última compra. */
  espera_horas: z.number().int().min(0).max(720).default(ESPERA_PADRAO_DO_CATALOGO_H),
  /** `false` = rascunho: fica guardado e a agente não o enxerga. */
  ativo: z.boolean().default(true),
});
export type ProdutoDoCatalogo = z.infer<typeof produtoDoCatalogoSchema>;

export const catalogoSchema = z
  .strictObject({
    enabled: z.boolean(),
    /** Em ordem de prioridade: entre os que a pessoa pode receber agora, vale o primeiro. */
    produtos: z.array(produtoDoCatalogoSchema).max(MAX_PRODUTOS_DO_CATALOGO).default([]),
  })
  .superRefine((c, ctx) => {
    const vistos = new Set<string>();
    c.produtos.forEach((p, i) => {
      const chave = slugDoProduto(p.nome);
      if (chave === "") {
        ctx.addIssue({ code: "custom", path: ["produtos", i, "nome"], message: "O nome precisa ter letras ou números." });
        return;
      }
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: "custom",
          path: ["produtos", i, "nome"],
          message: "Dois produtos com o mesmo nome — a compra de um seria lida como a do outro.",
        });
      }
      vistos.add(chave);
      if (p.depois_de !== undefined && slugDoProduto(p.depois_de) === chave) {
        ctx.addIssue({
          code: "custom",
          path: ["produtos", i, "depois_de"],
          message: "Um produto não pode depender da compra dele mesmo.",
        });
      }
    });
    // Dependência circular entre produtos do catálogo: nenhum dos dois seria oferecido, nunca.
    const dependeDe = new Map<string, string>();
    for (const p of c.produtos) {
      if (p.depois_de !== undefined) dependeDe.set(slugDoProduto(p.nome), slugDoProduto(p.depois_de));
    }
    c.produtos.forEach((p, i) => {
      const inicio = slugDoProduto(p.nome);
      let atual = dependeDe.get(inicio);
      for (let passos = 0; atual !== undefined && passos < MAX_PRODUTOS_DO_CATALOGO; passos++) {
        if (atual === inicio) {
          ctx.addIssue({
            code: "custom",
            path: ["produtos", i, "depois_de"],
            message: "Estes produtos dependem um do outro em círculo — nenhum seria oferecido.",
          });
          break;
        }
        atual = dependeDe.get(atual);
      }
    });
  });
export type CatalogoConfig = z.infer<typeof catalogoSchema>;

/** O menor valor do catálogo entre os produtos ATIVOS. `null` = desligado ou sem produto ativo. */
export function menorPrecoDoCatalogo(c: CatalogoConfig | null | undefined): number | null {
  if (!c || !c.enabled) return null;
  const ativos = c.produtos.filter((p) => p.ativo);
  return ativos.length === 0 ? null : Math.min(...ativos.map((p) => p.preco_cents));
}

/**
 * Lê `config.catalog` de forma DEFENSIVA: shape quebrado ou desligado viram `null` e o turno segue como
 * antes (com o pós-venda da aba Preço, se houver). Um jsonb editado à mão não derruba o atendimento.
 */
export function lerCatalogo(config: unknown): CatalogoConfig | null {
  const bruto = (config as { catalog?: unknown } | null | undefined)?.catalog;
  if (bruto === undefined || bruto === null) return null;
  const r = catalogoSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
