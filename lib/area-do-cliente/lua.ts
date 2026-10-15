/**
 * A FASE DA LUA para a área do cliente — conta pura, sem serviço externo.
 *
 * Idade da lua = dias desde uma lua nova conhecida (06/01/2000 18:14 UTC),
 * módulo o mês sinódico médio (29,530588853 dias). Erra até cerca de um dia
 * contra a efeméride exata, o que basta para "lua crescente esta semana" e
 * para a data da próxima cheia; não serve para astrologia de precisão.
 */

export const MES_SINODICO_DIAS = 29.530588853;
const LUA_NOVA_DE_REFERENCIA = Date.UTC(2000, 0, 6, 18, 14);
const DIA_MS = 86_400_000;

export type FaseDaLua = "nova" | "crescente" | "cheia" | "minguante";

/** Dias desde a última lua nova, de 0 a 29,53. */
export function idadeDaLua(quando: Date): number {
  const dias = (quando.getTime() - LUA_NOVA_DE_REFERENCIA) / DIA_MS;
  return ((dias % MES_SINODICO_DIAS) + MES_SINODICO_DIAS) % MES_SINODICO_DIAS;
}

/** As quatro fases como o calendário popular as conta: cada uma ~7,4 dias, centrada no seu marco. */
export function faseDaLua(quando: Date): FaseDaLua {
  const idade = idadeDaLua(quando);
  const quarto = MES_SINODICO_DIAS / 4;
  if (idade < quarto / 2 || idade >= MES_SINODICO_DIAS - quarto / 2) return "nova";
  if (idade < quarto * 1.5) return "crescente";
  if (idade < quarto * 2.5) return "cheia";
  return "minguante";
}

/** A próxima lua cheia ou nova a partir de `quando` (se for hoje, é hoje). */
export function proximaLua(quando: Date, qual: "cheia" | "nova"): Date {
  const alvo = qual === "nova" ? 0 : MES_SINODICO_DIAS / 2;
  const idade = idadeDaLua(quando);
  let faltam = alvo - idade;
  if (faltam < -0.5) faltam += MES_SINODICO_DIAS;
  return new Date(quando.getTime() + Math.max(0, faltam) * DIA_MS);
}
