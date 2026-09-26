/**
 * OS LIMITES DO AGENTE — o que ele nunca diz nem promete, e os assuntos que não discute, ditos pelo dono.
 *
 * Quarta das abas ESTRUTURADAS da configuração do agente (Preço, Identidade, Oferta, Objeções, Limites).
 * As outras dizem ao agente o que FAZER; esta diz o que NÃO fazer. É o que o dono do negócio sabe e o
 * modelo não tem como adivinhar: "não prometemos prazo de entrega", "não damos diagnóstico", "não
 * comparamos com concorrente". Sem isso, o modelo completa por conta própria — e é ali que nasce a
 * promessa que a empresa não pode cumprir.
 *
 * ─── O que NÃO está aqui, e por quê ────────────────────────────────────────────────────────────────
 *   • OS LIMITES DA PLATAFORMA. Não prometer resultado, não inventar prova nem urgência valem para TODO
 *     agente, queira o dono ou não; isso é uma camada universal e invisível, decidida à parte, e não um
 *     campo que o cliente pode esquecer de preencher. Esta aba só acrescenta o que é DA EMPRESA.
 *   • O PREÇO E O PISO. O piso de valor é uma trava em código (a aba Preço); aqui ele não é reescrito.
 *   • QUANDO CHAMAR UMA PESSOA. Tem política própria (palavras de transferência na aba Configuração). O
 *     bloco daqui só fixa o comportamento de fronteira: ao bater num limite, o agente não inventa, diz
 *     com gentileza que não pode e oferece chamar alguém da equipe.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * Toda empresa tem coisas que não diz e assuntos que não discute, em qualquer nicho. Duas listas curtas,
 * em texto livre do dono; nada é vocabulário de segmento.
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.limits` (jsonb, ao lado de `pricing`, `identity`, `offer` e `objections`), escrita
 * SÓ por `PUT /api/v1/ai/agents/:id/limites`, e vale no PRÓXIMO turno, sem publicar versão. `null` (ou
 * `enabled: false`) = desligado: o turno segue como antes, byte a byte.
 */
import { z } from "zod";

export const MAX_NUNCA_DIZ = 12;
export const MAX_ASSUNTOS = 8;
export const TAMANHO_NUNCA_DIZ = 120;
export const TAMANHO_ASSUNTO = 80;

/**
 * Um item de lista: sem aspas duplas, ponto e vírgula nem quebra de linha. O compilador junta os itens com
 * ponto e vírgula; um `;` dentro de um item viraria dois, e uma aspa abriria uma citação no meio do prompt.
 */
const item = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !v.includes('"') && !v.includes("\n") && !v.includes(";"), "sem aspas duplas, ponto e vírgula nem quebra de linha");

export const limitesSchema = z.strictObject({
  enabled: z.boolean(),
  /** O que o agente nunca diz nem promete, uma coisa por item. */
  nunca_diz: z.array(item(TAMANHO_NUNCA_DIZ)).max(MAX_NUNCA_DIZ).default([]),
  /** Assuntos que o agente não discute. */
  evita_assuntos: z.array(item(TAMANHO_ASSUNTO)).max(MAX_ASSUNTOS).default([]),
});
export type LimitesConfig = z.infer<typeof limitesSchema>;

/**
 * Atalhos da tela — coisas que quase toda empresa prefere que o agente não diga nem discuta. São atalhos,
 * não vocabulário fechado: o dono escreve o que quiser. A chave é só a identidade estável do atalho.
 */
export const SUGESTOES_NUNCA_DIZ = {
  resultado: "garantia de resultado",
  prazo: "prazo que não esteja na oferta",
  desconto: "desconto que não esteja combinado",
  saude: "diagnóstico ou indicação de tratamento",
  juridico: "aconselhamento jurídico ou financeiro",
} as const;

export const SUGESTOES_DE_ASSUNTOS = {
  politica: "política",
  religiao: "religião",
  concorrentes: "concorrentes",
  vida_pessoal: "vida pessoal da equipe",
} as const;

/**
 * Lê `config.limits` de forma DEFENSIVA: shape quebrado, desligado ou vazio viram `null` e o turno segue
 * sem bloco. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerLimites(config: unknown): LimitesConfig | null {
  const bruto = (config as { limits?: unknown } | null | undefined)?.limits;
  if (bruto === undefined || bruto === null) return null;
  const r = limitesSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
