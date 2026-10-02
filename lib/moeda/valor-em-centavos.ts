/**
 * "97,00", "1.297,50", "R$ 97", "97.5" → centavos. Vazio, zero, negativo ou texto que não é número
 * (uma variável que ninguém resolveu) → `null`: valor que não dá para afirmar não é zero.
 */
export function valorEmCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,-]/g, "");
  if (limpo === "" || limpo.startsWith("-")) return null;
  const decimal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(decimal);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}
