/**
 * IDENTIDADE E TOM DO AGENTE — o que o dono do negócio define sobre COMO o agente se apresenta e fala.
 *
 * Primeira das abas estruturadas da configuração do agente. O restante do prompt é um campo de texto
 * livre ("As instruções dele"); aqui o cliente preenche CAMPOS, e o código os compila num bloco literal
 * do turno (`bloco-do-prompt.ts`) — o mesmo padrão da aba Preço, e pelo mesmo motivo: o modelo pequeno
 * obedece a molde, e prosa livre é ignorada perto de um terço das vezes.
 *
 * ─── Genérico de propósito ────────────────────────────────────────────────────────────────────────
 * Nenhum campo é de nicho. Clínica, loja, imobiliária, infoproduto, terapeuta: todos têm um nome, uma
 * empresa, um público, um tom e palavras que a casa usa ou evita. O que é de nicho (a oferta, o roteiro,
 * as objeções) vai em abas próprias.
 *
 * ─── O que é livre e o que é fechado ──────────────────────────────────────────────────────────────
 * TOM, tratamento, emojis e tamanho são vocabulário FECHADO (o cliente escolhe, não digita): cada valor
 * tem uma frase-molde escrita aqui, revisada uma vez, e é ela que vai ao prompt. Deixar o cliente
 * escrever "o tom" em texto livre é o "prompt único" de novo. Nome, empresa, público e apresentação
 * são texto curto do cliente, com teto, e o compilador os reduz a UMA linha.
 *
 * ─── Onde mora ────────────────────────────────────────────────────────────────────────────────────
 * Em `ai_agents.config.identity` (jsonb, o mesmo lugar de `pricing` e `voice_reply`), escrita SÓ por
 * `PUT /api/v1/ai/agents/:id/identidade`, e vale no PRÓXIMO turno, sem publicar versão. `null` (ou
 * `enabled: false`) = desligado: o turno segue exatamente como antes, byte a byte.
 */
import { z } from "zod";

/** Os tons que o cliente escolhe, com o rótulo da tela e a frase-molde que vai ao prompt. */
export const TONS = ["acolhedor", "consultivo", "direto", "persuasivo", "descontraido", "formal"] as const;
export type Tom = (typeof TONS)[number];

export const DESCRICAO_DO_TOM: Record<Tom, { rotulo: string; tela: string; frase: string }> = {
  acolhedor: {
    rotulo: "Acolhedor",
    tela: "Caloroso e paciente: acolhe o que a pessoa sente antes de propor qualquer coisa.",
    frase: "caloroso e paciente; acolhe o que a pessoa sente antes de propor qualquer coisa",
  },
  consultivo: {
    rotulo: "Consultivo",
    tela: "Faz perguntas curtas para entender antes de recomendar.",
    frase: "consultivo; faz perguntas curtas para entender a situação antes de recomendar",
  },
  direto: {
    rotulo: "Direto",
    tela: "Vai ao ponto, sem rodeio, em frases curtas.",
    frase: "direto; vai ao ponto, sem rodeio, em frases curtas",
  },
  persuasivo: {
    rotulo: "Persuasivo",
    tela: "Conduz para a decisão com clareza, sem pressão nem urgência inventada.",
    frase: "persuasivo; conduz para a decisão com clareza, sem pressão e sem urgência inventada",
  },
  descontraido: {
    rotulo: "Descontraído",
    tela: "Leve e informal, como uma conversa entre conhecidos.",
    frase: "leve e informal, como uma conversa entre conhecidos",
  },
  formal: {
    rotulo: "Formal",
    tela: "Respeitoso e sem gírias, com tratamento cerimonioso.",
    frase: "formal e respeitoso, sem gírias",
  },
};

export const TRATAMENTOS = ["voce", "senhor"] as const;
export type Tratamento = (typeof TRATAMENTOS)[number];
export const FRASE_DO_TRATAMENTO: Record<Tratamento, string> = {
  voce: 'Trate a pessoa por "você".',
  senhor: 'Trate a pessoa por "o senhor" ou "a senhora", sem tutear.',
};

export const USOS_DE_EMOJI = ["nenhum", "parcimonia", "livre"] as const;
export type UsoDeEmoji = (typeof USOS_DE_EMOJI)[number];
export const FRASE_DO_EMOJI: Record<UsoDeEmoji, string> = {
  nenhum: "Não use emojis.",
  parcimonia: "Use emojis com parcimônia, e só se a pessoa usar primeiro.",
  livre: "Pode usar emojis à vontade, sem exagero.",
};

export const TAMANHOS = ["curto", "medio"] as const;
export type Tamanho = (typeof TAMANHOS)[number];
export const FRASE_DO_TAMANHO: Record<Tamanho, string> = {
  curto: "Escreva mensagens curtas, uma ideia por mensagem.",
  medio: "Escreva mensagens de tamanho médio, sem parágrafos longos.",
};

export const MAX_PALAVRAS = 10;

const textoCurto = (max: number) => z.string().trim().min(1).max(max);
const palavra = z.string().trim().min(1).max(40);

/**
 * Uma lista de palavras que só carrega o que o compilador pode citar entre aspas: sem quebra de
 * linha e sem aspas duplas (a aspa fecharia o trecho no meio do prompt).
 */
const listaDePalavras = z
  .array(palavra.refine((p) => !/["\n\r]/.test(p), "sem aspas duplas nem quebra de linha"))
  .max(MAX_PALAVRAS);

export const identidadeSchema = z.strictObject({
  enabled: z.boolean(),
  /** Como o agente se chama para a pessoa ("Ana"). */
  nome: textoCurto(60).optional(),
  /** O nome da empresa ("Clínica Bem-Estar"). */
  empresa: textoCurto(80).optional(),
  /** O que a empresa faz, em poucas palavras. */
  o_que_a_empresa_faz: textoCurto(400).optional(),
  /** Quem a empresa atende. */
  publico: textoCurto(300).optional(),
  /** Como o agente se apresenta na primeira mensagem, com as palavras do dono. */
  apresentacao: textoCurto(200).optional(),
  tom: z.enum(TONS).optional(),
  tratamento: z.enum(TRATAMENTOS).optional(),
  emojis: z.enum(USOS_DE_EMOJI).optional(),
  mensagens: z.enum(TAMANHOS).optional(),
  /** Palavras e expressões da casa, que o agente usa quando couber. */
  palavras_da_casa: listaDePalavras.default([]),
  /** Palavras que o agente nunca usa. */
  palavras_a_evitar: listaDePalavras.default([]),
});
export type IdentidadeConfig = z.infer<typeof identidadeSchema>;

/**
 * Lê `config.identity` de forma DEFENSIVA: shape quebrado, desligado ou vazio viram `null` e o turno
 * segue sem bloco. Um jsonb editado à mão não pode derrubar o atendimento.
 */
export function lerIdentidade(config: unknown): IdentidadeConfig | null {
  const bruto = (config as { identity?: unknown } | null | undefined)?.identity;
  if (bruto === undefined || bruto === null) return null;
  const r = identidadeSchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
