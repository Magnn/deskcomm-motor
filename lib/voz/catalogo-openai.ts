/**
 * As vozes prontas da OpenAI para síntese (`/v1/audio/speech`).
 *
 * A OpenAI NÃO publica gênero nem descrição por voz — a classificação abaixo é
 * a de como cada uma costuma soar, e a tela avisa que é aproximada. A lista é
 * estática porque a API não tem endpoint de listagem de vozes; quando a OpenAI
 * lançar uma voz nova, é aqui que ela entra.
 */
import type { VozDisponivel } from "./tipos";

type Linha = Pick<VozDisponivel, "id" | "nome" | "genero" | "descricao">;

const LINHAS: readonly Linha[] = [
  { id: "coral", nome: "Coral", genero: "feminina", descricao: "Calorosa e próxima, boa para acolher." },
  { id: "nova", nome: "Nova", genero: "feminina", descricao: "Clara e jovem, ritmo natural." },
  { id: "sage", nome: "Sage", genero: "feminina", descricao: "Serena e pausada." },
  { id: "shimmer", nome: "Shimmer", genero: "feminina", descricao: "Suave e leve." },
  { id: "marin", nome: "Marin", genero: "feminina", descricao: "Natural e expressiva; a mais recente." },
  { id: "alloy", nome: "Alloy", genero: "neutra", descricao: "Equilibrada, sem marca forte de gênero." },
  { id: "ash", nome: "Ash", genero: "masculina", descricao: "Firme e direta." },
  { id: "ballad", nome: "Ballad", genero: "masculina", descricao: "Suave e envolvente." },
  { id: "echo", nome: "Echo", genero: "masculina", descricao: "Clara e tranquila." },
  { id: "fable", nome: "Fable", genero: "masculina", descricao: "Narrador, com cadência de contador de histórias." },
  { id: "onyx", nome: "Onyx", genero: "masculina", descricao: "Grave e autoritária." },
  { id: "verse", nome: "Verse", genero: "masculina", descricao: "Expressiva e dinâmica." },
  { id: "cedar", nome: "Cedar", genero: "masculina", descricao: "Natural e calma; a mais recente." },
];

export const VOZES_DA_OPENAI: readonly VozDisponivel[] = LINHAS.map((l) => ({
  ...l,
  provedor: "openai" as const,
  categoria: "pronta" as const,
}));

/** O modelo que aceita `instructions` (estilo da fala) e fala português bem. */
export const MODELO_PADRAO_DA_OPENAI = "gpt-4o-mini-tts";

/** Só este modelo entende `instructions`; os `tts-1*` ignoram ou recusam o campo. */
export function modeloDaOpenAiAceitaInstrucoes(modelo: string): boolean {
  return modelo.startsWith("gpt-4o");
}
