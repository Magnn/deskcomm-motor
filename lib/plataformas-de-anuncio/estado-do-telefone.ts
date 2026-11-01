/**
 * O estado do cliente a partir do DDD do telefone, para a nota de correspondência da conversão.
 *
 * A Meta pede estado, cidade e CEP no evento de compra (lido em 01/11/2026 na tela do conjunto de dados:
 * "+8% de qualidade" para cada um). Cidade e CEP o atendimento não pergunta, e o Pix não traz. O estado sai
 * do DDD: a tabela é fixa, de domínio público, e cada DDD pertence a um estado só. Quem levou o número para
 * outro estado conta errado, o que é raro e só deixa de somar na correspondência daquele evento.
 *
 * Puro.
 */
const ESTADOS_POR_DDD: Record<string, readonly string[]> = {
  ac: ["68"],
  al: ["82"],
  am: ["92", "97"],
  ap: ["96"],
  ba: ["71", "73", "74", "75", "77"],
  ce: ["85", "88"],
  df: ["61"],
  es: ["27", "28"],
  go: ["62", "64"],
  ma: ["98", "99"],
  mg: ["31", "32", "33", "34", "35", "37", "38"],
  ms: ["67"],
  mt: ["65", "66"],
  pa: ["91", "93", "94"],
  pb: ["83"],
  pe: ["81", "87"],
  pi: ["86", "89"],
  pr: ["41", "42", "43", "44", "45", "46"],
  rj: ["21", "22", "24"],
  rn: ["84"],
  ro: ["69"],
  rr: ["95"],
  rs: ["51", "53", "54", "55"],
  sc: ["47", "48", "49"],
  se: ["79"],
  sp: ["11", "12", "13", "14", "15", "16", "17", "18", "19"],
  to: ["63"],
};

const ESTADO_DO_DDD = new Map(Object.entries(ESTADOS_POR_DDD).flatMap(([uf, ddds]) => ddds.map((ddd) => [ddd, uf] as const)));

/** A sigla em minúsculas (como a plataforma pede antes do hash), ou `null` fora do Brasil ou sem DDD válido. */
export function estadoDoTelefone(telefone: string | null | undefined): string | null {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (!digitos.startsWith("55") || digitos.length < 12 || digitos.length > 13) return null;
  return ESTADO_DO_DDD.get(digitos.slice(2, 4)) ?? null;
}
