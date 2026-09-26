/**
 * A OFERTA DO AGENTE — o que a empresa vende, dito pelo dono do negócio em campos.
 *
 * Segunda das abas ESTRUTURADAS da configuração do agente (a primeira é a Identidade). O que o agente
 * sabe sobre o que vende costuma estar espalhado em prosa nas instruções, e é ali que ele inventa: um
 * "inclui" que não inclui, uma entrega que não existe, uma garantia que ninguém deu. Aqui o dono declara
 * os fatos, e o código os compila num bloco literal do turno que diz "use SÓ estes fatos".
 *
 * ─── O que NÃO está aqui, e por quê ────────────────────────────────────────────────────────────────
 *   • O PREÇO. Tem aba própria (`config.pricing`) e é a única fonte de valor e de desconto: escrever o
 *     valor aqui também seria uma segunda verdade que diverge no primeiro reajuste. O bloco de oferta
 *     diz ao agente que valor e desconto vêm do bloco de preço, nunca daqui.
 *   • As perguntas frequentes e os materiais longos. Isso é CONHECIMENTO (a base que o agente consulta,
 *     com busca): a oferta guarda o que ele precisa dizer EXATAMENTE, curto, sempre à vista.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * Produto, serviço, plano, curso, sessão: todos têm um nome, o que é, o que inclui, para quem serve e
 * como é entregue. Nenhum campo é de nicho.
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.offer` (jsonb, o mesmo lugar de `pricing`, `identity` e `voice_reply`), escrita SÓ
 * por `PUT /api/v1/ai/agents/:id/oferta`, e vale no PRÓXIMO turno, sem publicar versão. `null` (ou
 * `enabled: false`) = desligado: o turno segue como antes, byte a byte.
 */
import { z } from "zod";

export const MAX_PRODUTOS = 12;
export const MAX_ITENS_INCLUIDOS = 8;
export const MAX_NAO_OFERECEMOS = 8;

const textoCurto = (max: number) => z.string().trim().min(1).max(max);

/**
 * Um item de lista: sem aspas duplas e sem quebra de linha. O compilador cita os itens entre aspas e junta
 * com ponto e vírgula; uma aspa fecharia o trecho no meio do prompt.
 */
const item = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !v.includes('"') && !v.includes("\n") && !v.includes(";"), "sem aspas duplas, ponto e vírgula nem quebra de linha");

export const produtoSchema = z.strictObject({
  /** Como o produto se chama para a pessoa. Único dentro da oferta. */
  nome: textoCurto(80),
  /** O que é, numa ou duas frases. */
  resumo: textoCurto(300).optional(),
  /** Quem costuma comprar, ou para quem serve. */
  para_quem: textoCurto(200).optional(),
  /** Como e quando a pessoa recebe. */
  entrega: textoCurto(200).optional(),
  /** O que vem junto, item a item. */
  inclui: z.array(item(120)).max(MAX_ITENS_INCLUIDOS).default([]),
});
export type ProdutoDaOferta = z.infer<typeof produtoSchema>;

export const ofertaSchema = z
  .strictObject({
    enabled: z.boolean(),
    produtos: z.array(produtoSchema).max(MAX_PRODUTOS).default([]),
    /** A política REAL de garantia e reembolso. O agente diz só isto, sem acrescentar nada. */
    garantia: textoCurto(300).optional(),
    /** O que a empresa NÃO faz e o agente nunca deve prometer nem oferecer. */
    nao_oferecemos: z.array(item(120)).max(MAX_NAO_OFERECEMOS).default([]),
  })
  .superRefine((o, ctx) => {
    const vistos = new Set<string>();
    o.produtos.forEach((p, i) => {
      const chave = p.nome.trim().toLowerCase();
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: "custom",
          path: ["produtos", i, "nome"],
          message: "Dois produtos com o mesmo nome — o agente não saberia qual deles a pessoa quer.",
        });
      }
      vistos.add(chave);
    });
  });
export type OfertaConfig = z.infer<typeof ofertaSchema>;

/**
 * Lê `config.offer` de forma DEFENSIVA: shape quebrado, desligado ou vazio viram `null` e o turno segue
 * sem bloco. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerOferta(config: unknown): OfertaConfig | null {
  const bruto = (config as { offer?: unknown } | null | undefined)?.offer;
  if (bruto === undefined || bruto === null) return null;
  const r = ofertaSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
