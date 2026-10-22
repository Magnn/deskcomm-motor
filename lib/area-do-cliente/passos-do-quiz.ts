/**
 * O FUNIL DOS QUIZZES DA PÁGINA, medido por nós — sem depender da Meta (migration 0944).
 *
 * Quem faz o quiz é anônimo até dar o e-mail: não tem contato nem sessão. A página gera um id de VISITA
 * aleatório (guardado no navegador) e manda cada passo; o banco guarda UMA linha por visita, quiz e passo
 * (a repetição é ignorada), então contar linhas de um passo é contar PESSOAS que chegaram nele.
 *
 * Os passos, em ordem, são o mesmo conjunto do CHECK de `area_quiz_passos.passo`, vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript`.
 */
import { z } from "zod";

export const QUIZZES_DA_PAGINA = ["sinastria", "prosperidade", "caminhos"] as const;
export type QuizDaPagina = (typeof QUIZZES_DA_PAGINA)[number];

export const PASSOS_DO_QUIZ = [
  "abriu", // a página carregou
  "dados", // passou dos nomes e datas
  "perguntas", // respondeu as perguntas (o quiz que não tem perguntas pula este)
  "email", // chegou à tela do e-mail
  "previa", // viu a prévia calculada
  "pagar", // clicou num botão de pagar
  "cobranca", // a cobrança foi criada (Pix na tela ou link de cartão aberto)
  "pago", // o pagamento foi confirmado
  "leitura", // a leitura completa apareceu
] as const;
export type PassoDoQuiz = (typeof PASSOS_DO_QUIZ)[number];

/** A posição do passo no funil (0 = abriu). Guardada na visita para ela só AVANÇAR. */
export function ordemDoPasso(passo: PassoDoQuiz): number {
  return PASSOS_DO_QUIZ.indexOf(passo);
}

/**
 * O que a página manda. `visita` é um UUID gerado no navegador. Sem `passo`, é só o sinal de "ainda estou aqui"
 * (renova o ao vivo). O resto é contexto curto, opcional.
 */
export const passoDoQuizSchema = z.strictObject({
  visita: z.string().uuid(),
  quiz: z.enum(QUIZZES_DA_PAGINA),
  passo: z.enum(PASSOS_DO_QUIZ).optional(),
  campanha: z.string().trim().max(80).optional(),
  origem: z.string().trim().max(40).optional(),
  moeda: z.enum(["BRL", "EUR", "USD"]).optional(),
  celular: z.boolean().optional(),
  fuso: z.string().trim().max(60).optional(),
  idioma: z.string().trim().max(20).optional(),
});

/**
 * A REGIÃO pelo fuso do aparelho — sem IP e sem serviço de fora. No Brasil vários fusos são de um estado só
 * (Manaus = AM, Rio Branco = AC…); o de São Paulo cobre Sudeste, Sul, GO e DF, e aí a região é o que dá para
 * afirmar. Fora do Brasil, o país pela cidade do fuso. `null` quando o fuso não diz nada.
 */
const REGIAO_POR_FUSO: Record<string, string> = {
  "America/Sao_Paulo": "Sudeste/Sul/GO/DF",
  "America/Bahia": "BA",
  "America/Recife": "PE",
  "America/Fortaleza": "CE/RN/PB/PI/MA",
  "America/Maceio": "AL/SE",
  "America/Belem": "PA/AP",
  "America/Santarem": "PA",
  "America/Araguaina": "TO",
  "America/Manaus": "AM",
  "America/Boa_Vista": "RR",
  "America/Porto_Velho": "RO",
  "America/Rio_Branco": "AC",
  "America/Eirunepe": "AM",
  "America/Cuiaba": "MT",
  "America/Campo_Grande": "MS",
  "America/Noronha": "Fernando de Noronha",
  "Europe/Lisbon": "Portugal",
  "Atlantic/Madeira": "Portugal (Madeira)",
  "Atlantic/Azores": "Portugal (Açores)",
  "Europe/London": "Reino Unido",
  "Europe/Dublin": "Irlanda",
  "Europe/Madrid": "Espanha",
  "Europe/Rome": "Itália",
  "Europe/Paris": "França",
  "Europe/Berlin": "Alemanha",
  "Europe/Zurich": "Suíça",
  "Europe/Brussels": "Bélgica",
  "Europe/Amsterdam": "Países Baixos",
  "Asia/Tokyo": "Japão",
  "America/Toronto": "Canadá",
  "America/Vancouver": "Canadá",
  "Australia/Sydney": "Austrália",
};
export function regiaoPeloFuso(fuso: string | null | undefined): string | null {
  const f = (fuso ?? "").trim();
  if (f === "") return null;
  if (REGIAO_POR_FUSO[f]) return REGIAO_POR_FUSO[f]!;
  if (/^America\/(New_York|Detroit|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Indiana)/.test(f) || f === "Pacific/Honolulu") return "Estados Unidos";
  const [continente, cidade] = f.split("/");
  return cidade ? `${continente} · ${cidade.replace(/_/g, " ")}` : null;
}
export type PassoEnviado = z.infer<typeof passoDoQuizSchema>;

export interface LinhaDoFunil {
  passo: PassoDoQuiz;
  pessoas: number;
  /** Fração de quem ABRIU que chegou aqui (0..1). */
  doTotal: number;
  /** Fração de quem chegou no passo anterior com gente que chegou aqui (0..1); `null` no primeiro. */
  doAnterior: number | null;
}

/**
 * O funil de um quiz a partir das contagens por passo. Os passos sem ninguém entram com zero, para a tela
 * mostrar onde a fila acaba. `perguntas` some do funil do quiz que não pergunta nada (prosperidade).
 */
export function funilDoQuiz(quiz: QuizDaPagina, contagens: Partial<Record<PassoDoQuiz, number>>): LinhaDoFunil[] {
  const passos = PASSOS_DO_QUIZ.filter((p) => !(p === "perguntas" && quiz === "prosperidade"));
  const topo = contagens.abriu ?? 0;
  let anterior: number | null = null;
  return passos.map((passo) => {
    const pessoas = contagens[passo] ?? 0;
    const linha: LinhaDoFunil = {
      passo,
      pessoas,
      doTotal: topo > 0 ? pessoas / topo : 0,
      doAnterior: anterior === null ? null : anterior > 0 ? pessoas / anterior : 0,
    };
    anterior = pessoas;
    return linha;
  });
}

/** Onde mais gente para: o passo com a maior perda em relação ao anterior (só conta onde havia alguém). */
export function maiorPerda(funil: readonly LinhaDoFunil[]): { de: PassoDoQuiz; para: PassoDoQuiz; perdidos: number } | null {
  let pior: { de: PassoDoQuiz; para: PassoDoQuiz; perdidos: number } | null = null;
  for (let i = 1; i < funil.length; i++) {
    const perdidos = funil[i - 1]!.pessoas - funil[i]!.pessoas;
    if (perdidos > 0 && (pior === null || perdidos > pior.perdidos)) pior = { de: funil[i - 1]!.passo, para: funil[i]!.passo, perdidos };
  }
  return pior;
}
