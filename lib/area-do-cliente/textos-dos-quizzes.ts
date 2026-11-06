/**
 * OS TEXTOS FIXOS DOS QUIZZES na língua de quem lê (pedido do dono em 06/11/2026, para anunciar fora do Brasil).
 *
 * Perguntas, respostas, capítulos e as prévias calculadas (signos, elementos, combinações, números, perfis, Vênus e
 * Descendente) vivem em português nas tabelas de `sinastria.ts`, `quizzes.ts` e `retrato-do-par.ts`. A página monta
 * aqui um dicionário português → idioma com TODOS eles e o entrega ao navegador; o quiz traduz só o que MOSTRA. A
 * resposta gravada continua em português, porque a pontuação (`perfilDosCaminhos`) e o pedido à IA comparam o texto
 * em português — e a IA já escreve a leitura paga no idioma (`instrucaoDeIdioma`).
 *
 * Puro.
 */
import { PERFIS_DOS_CAMINHOS, PERGUNTAS_DA_PROSPERIDADE, PERGUNTAS_DO_PAR, PERGUNTAS_DOS_CAMINHOS, TOM_DO_ANO_PESSOAL, TOM_DO_NUMERO } from "./quizzes";
import { ALMA_NO_AMOR, O_QUE_ATRAI, O_QUE_FAZ_BEM, SIGNOS_DO_ZODIACO } from "./retrato-do-par";
import { PERGUNTAS_DO_QUIZ, tomDaCombinacao, type Elemento } from "./sinastria";

const ELEMENTOS: Elemento[] = ["fogo", "terra", "ar", "água"];

/** Os pedaços fixos que as prévias juntam com um signo ("Vênus em Touro"). */
export const PEDACOS_DAS_PREVIAS = ["Vênus em", "Descendente em"] as const;

/** Todo texto fixo que um quiz mostra, sem repetição e na ordem em que aparece nas tabelas. */
export function textosDosQuizzes(): string[] {
  const t: string[] = [...SIGNOS_DO_ZODIACO, ...ELEMENTOS, ...PEDACOS_DAS_PREVIAS];
  for (const p of PERGUNTAS_DO_QUIZ) t.push(p.capitulo, p.texto, ...p.opcoes);
  for (const a of ELEMENTOS)
    for (const b of ELEMENTOS) {
      const tom = tomDaCombinacao(a, b);
      t.push(tom.titulo, tom.forte, tom.atencao);
    }
  for (const p of PERGUNTAS_DA_PROSPERIDADE) t.push(p.capitulo, p.texto, ...p.opcoes);
  t.push(...Object.values(TOM_DO_ANO_PESSOAL));
  for (const n of Object.values(TOM_DO_NUMERO)) t.push(n.titulo, n.texto);
  for (const p of PERGUNTAS_DOS_CAMINHOS) t.push(p.capitulo, p.texto, ...p.opcoes.map(([o]) => o));
  for (const p of Object.values(PERFIS_DOS_CAMINHOS)) t.push(p.titulo, p.texto, p.carta, p.sentidoDaCarta);
  for (const p of PERGUNTAS_DO_PAR) t.push(p.capitulo, p.texto, ...(p.apoio ? [p.apoio] : []), ...(p.rotulos ?? []), ...p.opcoes);
  t.push(...Object.values(O_QUE_ATRAI), ...Object.values(O_QUE_FAZ_BEM), ...Object.values(ALMA_NO_AMOR));
  // Escala de 1 a 5 é número: não se traduz.
  return [...new Set(t)].filter((s) => /\p{L}/u.test(s));
}

/** O dicionário que a página entrega ao quiz: só o que muda no idioma (em português, vazio). */
export function dicionarioDosQuizzes(traduzir: (texto: string) => string): Record<string, string> {
  const d: Record<string, string> = {};
  for (const s of textosDosQuizzes()) {
    const tr = traduzir(s);
    if (tr !== s) d[s] = tr;
  }
  return d;
}

/** O tradutor do navegador: o que não estiver no dicionário fica como veio. */
export const tradutorDoQuiz =
  (dicionario: Record<string, string>) =>
  (texto: string): string =>
    dicionario[texto] ?? texto;
