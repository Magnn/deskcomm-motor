/**
 * RASCUNHO POR IA — acelerador de preenchimento para as abas estruturadas do agente.
 *
 * Não é um domínio de prompt novo: é um gerador que, a partir de uma descrição curta do
 * negócio, PROPÕE os campos de texto livre de uma aba já existente (Identidade, Limites).
 * O dono revisa e edita por cima — nada é salvo sozinho; o rascunho só preenche o
 * formulário na tela, e o botão "Salvar" de cada aba continua sendo o único caminho de
 * escrita (e a única validação que decide o que pode ser gravado).
 *
 * ─── De onde veio ─────────────────────────────────────────────────────────────────────
 * Investigação do AcassIA (github.com/Magnn/acassia, `Coach.tsx` › `PersonaGenTab`): o
 * gerador de persona por IA de lá pedia knobs próprios (tom, energia, emojis…) que
 * DUPLICAVAM escolhas que este produto já tem como campo fechado na própria aba. Aqui o
 * único input extra é a descrição do negócio — tom/tratamento/emojis o dono já escolhe
 * nos controles da aba de Identidade, e o rascunho não pisa neles.
 *
 * ─── Por que os schemas abaixo são MAIS SOLTOS que identidadeSchema/limitesSchema ──────
 * A validação que decide o que pode ser SALVO já existe em `lib/identidade/tipos.ts` e
 * `lib/limites/tipos.ts`, e roda de novo no PUT de cada aba. Um segundo schema idêntico
 * (mesmos refines de caractere proibido, mesmos tetos exatos) seria uma segunda fonte da
 * mesma verdade. O efeito de ser mais solto aqui é só permitir que o rascunho aterrisse
 * no formulário mesmo um pouco torto — a tela trunca/sanitiza ao mesclar, e o dono ainda
 * edita antes de salvar.
 */
import { z } from "zod";

export const CAMPOS_RASCUNHAVEIS = ["identidade", "limites"] as const;
export type CampoRascunhavel = (typeof CAMPOS_RASCUNHAVEIS)[number];

export function ehCampoRascunhavel(v: string): v is CampoRascunhavel {
  return (CAMPOS_RASCUNHAVEIS as readonly string[]).includes(v);
}

export const MAX_CONTEXTO = 600;
export const MIN_CONTEXTO = 10;

export const rascunhoInputSchema = z.strictObject({
  campo: z.enum(CAMPOS_RASCUNHAVEIS),
  /** O que o dono escreveu sobre o próprio negócio — o único dado que a IA recebe. */
  contexto: z.string().trim().min(MIN_CONTEXTO).max(MAX_CONTEXTO),
});
export type RascunhoInput = z.infer<typeof rascunhoInputSchema>;

export const rascunhoIdentidadeSchema = z.object({
  nome: z.string().trim().min(1).optional(),
  empresa: z.string().trim().min(1).optional(),
  o_que_a_empresa_faz: z.string().trim().min(1).optional(),
  publico: z.string().trim().min(1).optional(),
  apresentacao: z.string().trim().min(1).optional(),
  palavras_da_casa: z.array(z.string().trim().min(1)).optional(),
  palavras_a_evitar: z.array(z.string().trim().min(1)).optional(),
});
export type RascunhoIdentidade = z.infer<typeof rascunhoIdentidadeSchema>;

export const rascunhoLimitesSchema = z.object({
  nunca_diz: z.array(z.string().trim().min(1)).optional(),
  evita_assuntos: z.array(z.string().trim().min(1)).optional(),
});
export type RascunhoLimites = z.infer<typeof rascunhoLimitesSchema>;

const IDENTIDADE_RASCUNHO_SYSTEM = `Você ajuda um dono de negócio a rascunhar como o atendente de IA dele se apresenta no WhatsApp.
Com base na descrição do negócio que a pessoa deu, devolva só os campos abaixo, em português do Brasil:
- nome: um primeiro nome curto e humano para o atendente (até 60 caracteres).
- empresa: o nome da empresa, tal como a pessoa escreveu ou o mais próximo disso (até 80 caracteres).
- o_que_a_empresa_faz: 1-2 frases dizendo o que a empresa vende ou oferece (até 400 caracteres).
- publico: 1 frase sobre quem costuma procurar essa empresa (até 300 caracteres).
- apresentacao: a PRIMEIRA MENSAGEM literal do atendente para um cliente novo, já usando o nome e a empresa (até 200 caracteres, uma frase curta e calorosa, sem emoji).
- palavras_da_casa: até 6 palavras ou expressões que essa empresa usaria naturalmente (uma palavra/expressão por item, sem pontuação nem aspas).
- palavras_a_evitar: até 4 palavras que soariam erradas ou frias para esse tipo de negócio (mesmo formato).
Nunca invente números, preços, prazos ou garantias — só o que dá para inferir do texto da pessoa. Se um campo não tiver como ser inferido, omita-o.`;

const LIMITES_RASCUNHO_SYSTEM = `Você ajuda um dono de negócio a rascunhar os limites do atendente de IA dele no WhatsApp: o que ele NUNCA diz nem promete, e os assuntos que não discute.
Com base na descrição do negócio que a pessoa deu, devolva:
- nunca_diz: até 6 frases curtas (até 120 caracteres cada) do que esse tipo de negócio tipicamente NÃO PODE prometer ou afirmar sem risco (ex.: prazo exato, resultado garantido, comparação com concorrente) — pense no que seria arriscado esse atendente dizer sozinho, sem checar com uma pessoa da equipe.
- evita_assuntos: até 4 assuntos curtos (até 80 caracteres cada) que fogem do escopo do atendimento (ex.: política, um assunto jurídico que não seja da própria empresa).
Cada item é uma frase ou palavra ISOLADA, sem aspas, sem ponto e vírgula, sem quebra de linha. Não repita itens. Se não houver base suficiente no texto da pessoa, devolva listas menores ou vazias — nunca invente um risco que não faz sentido para o negócio descrito.`;

interface DefinicaoDeCampo<T> {
  schema: z.ZodType<T>;
  system: string;
}

/**
 * Um `switch` exaustivo sobre `CampoRascunhavel`: acrescentar um campo à lista sem um
 * `case` aqui quebra o typecheck, não silenciosamente em runtime.
 */
export function definicaoDoCampo(campo: CampoRascunhavel): DefinicaoDeCampo<unknown> {
  switch (campo) {
    case "identidade":
      return { schema: rascunhoIdentidadeSchema, system: IDENTIDADE_RASCUNHO_SYSTEM };
    case "limites":
      return { schema: rascunhoLimitesSchema, system: LIMITES_RASCUNHO_SYSTEM };
  }
}
