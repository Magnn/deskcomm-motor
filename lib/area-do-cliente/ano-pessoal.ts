/**
 * O ANO PESSOAL — a leitura do ano que começa no aniversário.
 *
 * O número do ano pessoal é a conta da numerologia popular: dia + mês do
 * nascimento + o ano em curso, somando os algarismos até sobrar um de 1 a 9.
 * A leitura em si é escrita pela IA (`gerarAnoPessoal`, em `circulo-ia.ts`),
 * paga uma vez por ano.
 *
 * A oferta aparece na janela do aniversário: de 15 dias antes a 30 dias depois.
 */
import { diasParaOAniversario } from "./aniversario";

export const DIAS_ANTES_DA_OFERTA = 15;
export const DIAS_DEPOIS_DA_OFERTA = 30;
export const EXTRA_DO_ANO_PESSOAL = "ano-pessoal";

function reduzir(n: number): number {
  let v = n;
  while (v > 9) v = String(v).split("").reduce((s, d) => s + Number(d), 0);
  return v;
}

/** O número do ano pessoal (1–9) de quem nasceu em `nascimentoIso`, para o ano `ano`. */
export function numeroDoAnoPessoal(nascimentoIso: string, ano: number): number {
  const [, mm, dd] = nascimentoIso.split("-").map(Number) as [number, number, number];
  return reduzir(reduzir(dd) + reduzir(mm) + reduzir(ano));
}

/** A oferta do Ano Pessoal está na janela? E qual ano ele cobre (o do aniversário mais próximo). */
export function janelaDoAnoPessoal(nascimentoIso: string, hojeIso: string): { aberta: boolean; ano: number } {
  const faltam = diasParaOAniversario(nascimentoIso, hojeIso);
  const anoDeHoje = Number(hojeIso.slice(0, 4));
  const [, mm, dd] = nascimentoIso.split("-").map(Number) as [number, number, number];
  const jaPassouEsteAno = hojeIso.slice(5) > `${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  // O ano é o do aniversário a que a janela se refere: o que vem (antes) ou o que passou (depois).
  const antes = faltam <= DIAS_ANTES_DA_OFERTA;
  const depois = !antes && faltam >= 365 - DIAS_DEPOIS_DA_OFERTA;
  const ano = antes ? (jaPassouEsteAno ? anoDeHoje + 1 : anoDeHoje) : jaPassouEsteAno ? anoDeHoje : anoDeHoje - 1;
  return { aberta: antes || depois, ano };
}
