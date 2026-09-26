/**
 * AS OBJEÇÕES DO AGENTE — o que a pessoa costuma dizer para não fechar, e a resposta que o dono aprovou.
 *
 * Terceira das abas ESTRUTURADAS da configuração do agente (Identidade, Oferta, Objeções; a aba Preço é a
 * mais antiga). Objeção é o momento em que o agente mais improvisa: "tá caro", "vou pensar", "preciso falar
 * com meu marido". Sem uma resposta aprovada, o modelo inventa uma — uma urgência que não existe, uma
 * garantia que ninguém deu, uma pressão que afasta. Aqui o dono escreve, uma vez, o que quer que seja dito,
 * e o código compila isso num bloco do turno.
 *
 * ─── O que NÃO está aqui, e por quê ────────────────────────────────────────────────────────────────
 *   • VALOR E DESCONTO. A resposta a uma objeção de preço é a escada da aba Preço (o piso, os degraus, o
 *     cupom). Escrever "por R$ 80 eu fecho" numa resposta seria uma segunda verdade que diverge no primeiro
 *     reajuste — e a única coisa que o agente não pode fazer é oferecer abaixo do piso. O schema recusa
 *     valor em dinheiro na resposta e diz onde ele mora.
 *   • O que o agente NUNCA diz (prova falsa, garantia de resultado, urgência inventada). Isso é a aba
 *     Limites, que vem depois, com um linter de promessas na publicação. O bloco daqui carrega só a regra
 *     mínima e fixa: não inventar prova, prazo, garantia nem desconto.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * Toda venda tem objeções, em qualquer nicho. Nenhum campo é de segmento: "quando a pessoa diz" e "o que o
 * agente responde". As SUGESTÕES abaixo são as que se repetem em qualquer negócio.
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.objections` (jsonb, ao lado de `pricing`, `identity` e `offer`), escrita SÓ por
 * `PUT /api/v1/ai/agents/:id/objecoes`, e vale no PRÓXIMO turno, sem publicar versão. `null` (ou
 * `enabled: false`) = desligado: o turno segue como antes, byte a byte.
 */
import { z } from "zod";

export const MAX_OBJECOES = 10;
export const MAX_QUANDO = 100;
export const MAX_RESPOSTA = 400;

const textoCurto = (max: number) => z.string().trim().min(1).max(max);

/**
 * Valor em dinheiro: símbolo de moeda, ou número seguido do nome da moeda. Sem `\b`/`\d`, de propósito
 * (classes literais): a regra fica legível e não depende de escape.
 */
const VALOR_EM_DINHEIRO = /[$€£]|[0-9][ ]*(?:reais?|dólares|dolares|euros)/i;

export const MENSAGEM_SEM_DINHEIRO =
  "Sem valores em dinheiro na resposta — o preço e o desconto vêm da aba Preço.";

export const MENSAGEM_FRASE_REPETIDA = "Duas objeções com a mesma frase — o agente não saberia qual resposta usar.";

export const objecaoSchema = z.strictObject({
  /** Como a pessoa costuma dizer, com as palavras dela. Único dentro da lista. */
  quando: textoCurto(MAX_QUANDO),
  /** O que o agente deve responder, no sentido aprovado pelo dono. */
  resposta: textoCurto(MAX_RESPOSTA).refine((r) => !VALOR_EM_DINHEIRO.test(r), MENSAGEM_SEM_DINHEIRO),
});
export type ObjecaoDoAgente = z.infer<typeof objecaoSchema>;

export const objecoesSchema = z
  .strictObject({
    enabled: z.boolean(),
    objecoes: z.array(objecaoSchema).max(MAX_OBJECOES).default([]),
  })
  .superRefine((o, ctx) => {
    const vistos = new Set<string>();
    o.objecoes.forEach((x, i) => {
      const chave = x.quando.trim().toLowerCase();
      if (vistos.has(chave)) {
        ctx.addIssue({
          code: "custom",
          path: ["objecoes", i, "quando"],
          message: MENSAGEM_FRASE_REPETIDA,
        });
      }
      vistos.add(chave);
    });
  });
export type ObjecoesConfig = z.infer<typeof objecoesSchema>;

/**
 * As objeções que se repetem em qualquer negócio — atalhos da tela, não vocabulário fechado: o dono
 * escreve o que quiser. A chave é só a identidade estável da sugestão.
 */
export const SUGESTOES_DE_OBJECAO = {
  caro: "Está caro",
  pensar: "Vou pensar",
  terceiro: "Preciso falar com outra pessoa",
  confianca: "Não confio",
  ja_tentei: "Já tentei antes e não deu certo",
  sem_tempo: "Não tenho tempo agora",
  sem_momento: "Não é o momento",
} as const;

/**
 * Lê `config.objections` de forma DEFENSIVA: shape quebrado, desligado ou vazio viram `null` e o turno segue
 * sem bloco. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerObjecoes(config: unknown): ObjecoesConfig | null {
  const bruto = (config as { objections?: unknown } | null | undefined)?.objections;
  if (bruto === undefined || bruto === null) return null;
  const r = objecoesSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
