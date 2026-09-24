/**
 * NÚMEROS E VALORES PARA FALAR — "R$ 130" vira "cento e trinta reais".
 *
 * Uma nota de voz que lê "R$ 130" como "erre cifrão um três zero" ou "R dólar cento
 * e trinta" denuncia a máquina na primeira frase. Quem fala escreve o valor por
 * extenso; aqui o texto passa por isso ANTES de ir ao provedor. O texto original
 * segue como legenda da mensagem no inbox — só a FALA muda.
 *
 * Cobre até 999.999 (o que uma oferta de WhatsApp precisa); acima disso o trecho
 * fica como veio, e o provedor lê como sabe.
 */

const UNIDADES = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "catorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

function ateNoventaENove(n: number): string {
  if (n < 20) return UNIDADES[n]!;
  const dezena = DEZENAS[Math.floor(n / 10)]!;
  const unidade = n % 10;
  return unidade === 0 ? dezena : `${dezena} e ${UNIDADES[unidade]}`;
}

function ateNovecentosENoventaENove(n: number): string {
  if (n === 100) return "cem";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  if (centena === 0) return ateNoventaENove(resto);
  return resto === 0 ? CENTENAS[centena]! : `${CENTENAS[centena]} e ${ateNoventaENove(resto)}`;
}

/** `null` para o que não cobrimos (negativo, fração, acima de 999.999). */
export function numeroPorExtenso(n: number): string | null {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) return null;
  if (n < 1000) return ateNovecentosENoventaENove(n);
  const milhares = Math.floor(n / 1000);
  const resto = n % 1000;
  const parteMil = milhares === 1 ? "mil" : `${ateNovecentosENoventaENove(milhares)} mil`;
  if (resto === 0) return parteMil;
  // "mil e um", "mil e cem", "dois mil e quinhentos" — mas "mil cento e um".
  const liga = resto < 100 || resto % 100 === 0 ? " e " : " ";
  return `${parteMil}${liga}${ateNovecentosENoventaENove(resto)}`;
}

function reais(valor: number): string | null {
  const extenso = numeroPorExtenso(valor);
  if (extenso === null) return null;
  return valor === 1 ? "um real" : `${extenso} reais`;
}

function centavos(valor: number): string {
  const extenso = numeroPorExtenso(valor) ?? String(valor);
  return valor === 1 ? "um centavo" : `${extenso} centavos`;
}

/** "R$ 130", "R$130,50", "R$ 1.299,90" → o valor por extenso. O resto do texto não é tocado. */
export function valoresEmReaisPorExtenso(texto: string): string {
  return texto.replace(/R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (inteiro, parteReais: string, parteCentavos?: string) => {
    const r = Number(parteReais.replace(/\./g, ""));
    const c = parteCentavos === undefined ? 0 : Number(parteCentavos.length === 1 ? `${parteCentavos}0` : parteCentavos);
    const falaReais = reais(r);
    if (falaReais === null) return inteiro;
    if (c === 0) return falaReais;
    // "R$ 0,50" → só os centavos: "zero reais e cinquenta centavos" é fala de robô.
    return r === 0 ? centavos(c) : `${falaReais} e ${centavos(c)}`;
  });
}
