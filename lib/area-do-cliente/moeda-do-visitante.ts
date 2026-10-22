/**
 * A MOEDA de quem abre um quiz da página.
 *
 * O quiz não tem telefone (o preço do atendimento usa o DDI, `lib/preco/preco-internacional.ts`), então a
 * página usa o FUSO do aparelho: é onde a pessoa está, e não a língua dela — uma brasileira em Lisboa tem o
 * aparelho em português e o fuso de Lisboa, e é em euro que ela paga. Fuso do Brasil (ou que não dá para
 * ler) paga em reais, com Pix; fuso de país do euro paga em euro; o resto do mundo, em dólar. Em moeda
 * estrangeira só há cartão: Pix é só do Brasil.
 *
 * O navegador só PROPÕE a moeda. Quem decide o valor é o servidor, pela configuração da oferta
 * (`precoDaOferta`): uma moeda sem preço configurado é recusada, e o valor nunca vem do navegador.
 *
 * Tudo aqui é puro.
 */
import type { MoedaInternacional, PrecoInternacional } from "@/lib/preco/tipos";

export type MoedaDaPagina = "BRL" | MoedaInternacional;

/** Fusos da IANA que são do Brasil. */
const FUSOS_DO_BRASIL = new Set([
  "America/Sao_Paulo",
  "America/Araguaina",
  "America/Bahia",
  "America/Belem",
  "America/Boa_Vista",
  "America/Campo_Grande",
  "America/Cuiaba",
  "America/Eirunepe",
  "America/Fortaleza",
  "America/Maceio",
  "America/Manaus",
  "America/Noronha",
  "America/Porto_Velho",
  "America/Recife",
  "America/Rio_Branco",
  "America/Santarem",
  "Brazil/Acre",
  "Brazil/DeNoronha",
  "Brazil/East",
  "Brazil/West",
]);

/** Fusos da IANA dos países que usam o euro (os mesmos países de `DDIS_DO_EURO` do preço do atendimento). */
const FUSOS_DO_EURO = new Set([
  "Europe/Athens",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Paris",
  "Europe/Madrid",
  "Atlantic/Canary",
  "Africa/Ceuta",
  "Europe/Rome",
  "Europe/Vienna",
  "Europe/Berlin",
  "Europe/Lisbon",
  "Atlantic/Madeira",
  "Atlantic/Azores",
  "Europe/Luxembourg",
  "Europe/Dublin",
  "Europe/Malta",
  "Asia/Nicosia",
  "Asia/Famagusta",
  "Europe/Nicosia",
  "Europe/Helsinki",
  "Europe/Vilnius",
  "Europe/Riga",
  "Europe/Tallinn",
  "Europe/Monaco",
  "Europe/Zagreb",
  "Europe/Ljubljana",
  "Europe/Bratislava",
]);

/** A moeda proposta pelo fuso do aparelho. Fuso vazio ou estranho fica em reais — o que era antes. */
export function moedaPeloFuso(fuso: string | null | undefined): MoedaDaPagina {
  const f = (fuso ?? "").trim();
  if (f === "" || FUSOS_DO_BRASIL.has(f)) return "BRL";
  if (FUSOS_DO_EURO.has(f)) return "EUR";
  if (!f.includes("/")) return "BRL";
  return "USD";
}

/**
 * O preço da oferta na moeda pedida, em centavos dela, ou `null` quando aquela moeda não é vendida — e aí a
 * página cai para reais. Reais é sempre o `preco_cents` da oferta.
 */
export function precoDaOferta(
  oferta: { preco_cents: number; precos_internacionais?: readonly PrecoInternacional[] },
  moeda: MoedaDaPagina,
): number | null {
  if (moeda === "BRL") return oferta.preco_cents;
  return oferta.precos_internacionais?.find((p) => p.currency === moeda)?.price_cents ?? null;
}

/** A moeda que a página vai MESMO usar: a do fuso, se a oferta tiver preço nela; senão, reais. */
export function moedaDaOferta(
  oferta: { preco_cents: number; precos_internacionais?: readonly PrecoInternacional[] },
  fuso: string | null | undefined,
): MoedaDaPagina {
  const proposta = moedaPeloFuso(fuso);
  return precoDaOferta(oferta, proposta) === null ? "BRL" : proposta;
}

/** "R$ 37,00", "€ 9,90", "US$ 12,00" — como a página sempre mostrou o valor em reais. */
export function valorNaMoedaDaPagina(cents: number, moeda: MoedaDaPagina): string {
  const simbolo = moeda === "EUR" ? "€" : moeda === "USD" ? "US$" : "R$";
  return `${simbolo} ${(cents / 100).toFixed(2).replace(".", ",")}`;
}
