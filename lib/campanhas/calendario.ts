/**
 * O CALENDÁRIO das campanhas — puro, sem banco e sem relógio.
 *
 * Cada campanha aparece no dia em que ela FALA com as pessoas: o dia agendado,
 * ou o dia em que começou a enviar. Rascunho e campanha só preparada não têm
 * dia — pô-los no dia em que foram criados diria "houve envio aqui" onde não
 * houve nenhum.
 *
 * O dia é contado no fuso de quem está olhando (o do navegador): uma campanha
 * agendada para as 23h não pode aparecer no dia seguinte por causa do UTC.
 */
export interface CampanhaNoCalendario {
  id: string;
  name: string;
  status: string;
  scheduled_at: string | null;
  started_at: string | null;
}

/** `aaaa-mm-dd` no fuso LOCAL de quem lê. */
export function chaveDoDia(data: Date): string {
  const m = String(data.getMonth() + 1).padStart(2, "0");
  const d = String(data.getDate()).padStart(2, "0");
  return `${data.getFullYear()}-${m}-${d}`;
}

/** O instante em que a campanha fala com as pessoas, ou `null` se ainda não tem. */
export function diaDaCampanha(c: Pick<CampanhaNoCalendario, "scheduled_at" | "started_at">): Date | null {
  // O que ACONTECEU vence o que estava planejado: campanha agendada para terça
  // e iniciada à mão na segunda mora na segunda.
  const iso = c.started_at ?? c.scheduled_at;
  if (!iso) return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function campanhasPorDia<T extends CampanhaNoCalendario>(campanhas: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const c of campanhas) {
    const dia = diaDaCampanha(c);
    if (!dia) continue;
    const chave = chaveDoDia(dia);
    mapa.set(chave, [...(mapa.get(chave) ?? []), c]);
  }
  return mapa;
}

export interface DiaDaGrade {
  data: Date;
  chave: string;
  /** Pertence ao mês mostrado? (as bordas trazem dias dos meses vizinhos) */
  doMes: boolean;
}

/**
 * As semanas inteiras que cobrem o mês — começando no domingo, como o calendário
 * de parede. `mes` é 0–11.
 */
export function gradeDoMes(ano: number, mes: number): DiaDaGrade[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  const ultimo = new Date(ano, mes + 1, 0);
  const fim = new Date(ano, mes + 1, 6 - ultimo.getDay());
  const dias: DiaDaGrade[] = [];
  for (let d = new Date(inicio); d <= fim; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    dias.push({ data: d, chave: chaveDoDia(d), doMes: d.getMonth() === mes });
  }
  return dias;
}
