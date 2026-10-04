/**
 * A JORNADA DO AGENTE — as etapas da conversa, ditas pelo dono do negócio, contadas pelo código.
 *
 * As outras abas estruturadas (Identidade, Oferta, Consciência, Objeções, Limites, Preço) dizem ao agente
 * QUEM ele é e O QUE sabe. Esta diz EM QUE ORDEM a conversa anda: acolher, coletar os dados, mostrar,
 * oferecer. É o procedimento que um atendente humano segue — o que Decagon chama de AOP, Sierra de
 * "Journeys" e Parlant de "journeys": instrução em linguagem natural do dono, estado decidido por código.
 *
 * ─── Por que o estado é do código e não do modelo ─────────────────────────────────────────────────
 * Medido aqui mesmo duas vezes (`lib/preco/estado-da-negociacao.ts`, `lib/leitura/estado-da-leitura.ts`):
 * o modelo pequeno não guarda "em que passo estamos" de forma confiável ao longo de vários turnos. Ele
 * pula etapa, volta, adianta o preço. Então o código conta a etapa sobre o histórico (`estado.ts`) e o
 * prompt recebe SÓ a etapa atual (`bloco-do-prompt.ts`): a seguinte não aparece antes da hora, e o que a
 * etapa ainda não libera (preço, link) é vetado no envio.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * Nada aqui é de segmento. Uma clínica (acolher → sintomas → horário), uma loja (acolher → o que procura →
 * produto → pagamento) e uma leitura (acolher → dados → escolha → leitura → oferta) são a mesma peça com
 * etapas diferentes. Três tipos de campo cobrem o que o código consegue CONFERIR sem modelo: número, data
 * e "a pessoa respondeu" (texto — o sentido quem lê é a IA).
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.journey` (jsonb, ao lado das outras abas), escrita SÓ por
 * `PUT /api/v1/ai/agents/:id/jornada`; vale no PRÓXIMO turno, sem publicar versão. `null` (ou
 * `enabled: false`) = desligada: o turno segue como antes, byte a byte.
 */
import { z } from "zod";

export const MAX_ETAPAS = 12;
export const MAX_CAMPOS_POR_ETAPA = 6;
export const TAMANHO_NOME = 60;
export const TAMANHO_OBJETIVO = 400;
export const TAMANHO_ROTULO = 60;

/** O que o código sabe conferir numa resposta sem perguntar ao modelo. */
export const TIPOS_DE_CAMPO = ["texto", "data", "numeros"] as const;
export type TipoDeCampo = (typeof TIPOS_DE_CAMPO)[number];

/** Como a etapa termina: quando os campos estão completos, ou quando a pessoa responde à etapa. */
export const SAIDAS = ["campos", "resposta"] as const;
export type SaidaDaEtapa = (typeof SAIDAS)[number];

/**
 * O que o agente só pode mencionar A PARTIR de uma etapa — a catraca. Liberar é cumulativo: a etapa que
 * libera o preço libera para ela e para todas as seguintes.
 */
export const LIBERACOES = ["oferta", "preco", "link"] as const;
export type Liberacao = (typeof LIBERACOES)[number];

/** Como cada liberação aparece no prompt e na tela. */
export const NOME_DA_LIBERACAO: Record<Liberacao, string> = {
  oferta: "a oferta (o produto ou serviço à venda)",
  preco: "o preço",
  link: "o link de pagamento",
};

const SLUG = /^[a-z][a-z0-9_]{0,29}$/;

/** Texto que vira linha do prompt: sem aspas duplas nem quebra de linha. */
const texto = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !v.includes('"') && !v.includes("\n"), "sem aspas duplas nem quebra de linha");

export const campoSchema = z
  .strictObject({
    /** Identidade estável do campo (`nome`, `nascimento`, `numeros`). */
    chave: z.string().regex(SLUG, "chave: letras minúsculas, números e _"),
    /** Como o campo aparece para o agente e na tela ("Data de nascimento"). */
    rotulo: texto(TAMANHO_ROTULO),
    tipo: z.enum(TIPOS_DE_CAMPO),
    /** Só em `numeros`: quantos números, e o intervalo aceito. */
    quantidade: z.number().int().min(1).max(10).optional(),
    minimo: z.number().int().min(0).max(9999).optional(),
    maximo: z.number().int().min(0).max(9999).optional(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo !== "numeros") return;
    if (c.quantidade === undefined || c.minimo === undefined || c.maximo === undefined) {
      ctx.addIssue({ code: "custom", message: "campo de números precisa de quantidade, mínimo e máximo" });
      return;
    }
    if (c.minimo > c.maximo) ctx.addIssue({ code: "custom", message: "o mínimo é maior que o máximo" });
    else if (c.quantidade > c.maximo - c.minimo + 1) {
      ctx.addIssue({ code: "custom", message: "não cabem tantos números diferentes nesse intervalo" });
    }
  });
export type CampoDaEtapa = z.infer<typeof campoSchema>;

export const etapaSchema = z
  .strictObject({
    id: z.string().regex(SLUG, "id: letras minúsculas, números e _"),
    nome: texto(TAMANHO_NOME),
    /** O que a etapa precisa conseguir, em linguagem do dono. */
    objetivo: texto(TAMANHO_OBJETIVO),
    campos: z.array(campoSchema).max(MAX_CAMPOS_POR_ETAPA).default([]),
    saida: z.enum(SAIDAS),
    /** O que passa a poder ser dito a partir desta etapa. */
    libera: z.array(z.enum(LIBERACOES)).max(LIBERACOES.length).default([]),
  })
  .superRefine((e, ctx) => {
    if (e.saida === "campos" && e.campos.length === 0) {
      ctx.addIssue({ code: "custom", message: `a etapa "${e.nome}" termina pelos campos, mas não tem campo` });
    }
    if (new Set(e.libera).size !== e.libera.length) {
      ctx.addIssue({ code: "custom", message: `a etapa "${e.nome}" libera o mesmo item duas vezes` });
    }
  });
export type EtapaDaJornada = z.infer<typeof etapaSchema>;

export const jornadaSchema = z
  .strictObject({
    enabled: z.boolean(),
    etapas: z.array(etapaSchema).min(1).max(MAX_ETAPAS),
  })
  .superRefine((j, ctx) => {
    const ids = j.etapas.map((e) => e.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "duas etapas com o mesmo id" });
    const chaves = j.etapas.flatMap((e) => e.campos.map((c) => c.chave));
    if (new Set(chaves).size !== chaves.length) {
      ctx.addIssue({ code: "custom", message: "dois campos com a mesma chave na jornada" });
    }
  });
export type JornadaConfig = z.infer<typeof jornadaSchema>;

/**
 * Lê `config.journey` de forma DEFENSIVA: shape quebrado ou desligado vira `null` e o turno segue sem
 * jornada. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerJornada(config: unknown): JornadaConfig | null {
  const bruto = (config as { journey?: unknown } | null | undefined)?.journey;
  if (bruto === undefined || bruto === null) return null;
  const r = jornadaSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
