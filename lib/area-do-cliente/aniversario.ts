/**
 * O ANIVERSÁRIO na área do cliente: a data que a pessoa conta (e o CRM já
 * guarda em `contacts.birthdate`) e a semana em que a área a celebra.
 */

/** `AAAA-MM-DD` real, não no futuro e de no máximo 110 anos atrás. */
export function dataDeNascimentoValida(iso: string, hoje = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return false;
  const anos = (hoje.getTime() - d.getTime()) / (365.25 * 86_400_000);
  return anos >= 0 && anos <= 110;
}

/**
 * Faltam quantos dias para o próximo aniversário, contando de `hojeIso`
 * (`AAAA-MM-DD`, já no fuso da organização). 0 = é hoje. Quem nasceu em 29/02
 * comemora em 28/02 nos anos comuns.
 */
export function diasParaOAniversario(nascimentoIso: string, hojeIso: string): number {
  const [, mm, dd] = nascimentoIso.split("-").map(Number) as [number, number, number];
  const [ano, hm, hd] = hojeIso.split("-").map(Number) as [number, number, number];
  const hoje = Date.UTC(ano, hm - 1, hd);
  const noAno = (a: number) => {
    const bissexto = (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
    const dia = mm === 2 && dd === 29 && !bissexto ? 28 : dd;
    return Date.UTC(a, mm - 1, dia);
  };
  let proximo = noAno(ano);
  if (proximo < hoje) proximo = noAno(ano + 1);
  return Math.round((proximo - hoje) / 86_400_000);
}

/** A área celebra no dia e nos 6 dias seguintes — a semana do aniversário. */
export function semanaDoAniversario(nascimentoIso: string, hojeIso: string): boolean {
  const faltam = diasParaOAniversario(nascimentoIso, hojeIso);
  return faltam === 0 || faltam >= 359;
}
