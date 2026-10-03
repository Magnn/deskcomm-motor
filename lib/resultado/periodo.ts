/**
 * O PERÍODO DAS TELAS DE RESULTADO — o mesmo recorte para o dashboard e para a
 * receita atribuída. Duas cópias desta conta fariam as duas telas, lado a lado,
 * falarem de períodos diferentes com o mesmo rótulo.
 */
export interface Intervalo {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export function calcularIntervalo(period: string, now: Date): Intervalo {
  const end = new Date(now);
  const start = new Date(now);

  if (period === "today") {
    start.setHours(0, 0, 0, 0);
  } else if (period === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (period === "7d") {
    start.setDate(start.getDate() - 7);
  } else if (period === "30d") {
    start.setDate(start.getDate() - 30);
  } else if (period === "this_month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (period === "last_month") {
    start.setMonth(start.getMonth() - 1);
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setDate(0);
    end.setHours(23, 59, 59, 999);
  } else {
    // Padrão: 7 dias.
    start.setDate(start.getDate() - 7);
  }

  const duracaoMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duracaoMs);

  return { start, end, prevStart, prevEnd };
}

export function calcularDelta(atual: number, anterior: number): number {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}
