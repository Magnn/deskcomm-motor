/**
 * O PERÍODO DAS TELAS DE RESULTADO — o mesmo recorte para o dashboard e para a
 * receita atribuída. Duas cópias desta conta fariam as duas telas, lado a lado,
 * falarem de períodos diferentes com o mesmo rótulo.
 *
 * ─── O dia é o da ORGANIZAÇÃO, não o do servidor ────────────────────────────
 *
 * O servidor roda em UTC. Com `setHours(0)` no fuso do processo, "Hoje" começava
 * à meia-noite de Londres: às 21h de São Paulo o painel já estava no dia
 * seguinte — zerado — e o gasto de anúncio era pedido para um dia que, na conta,
 * ainda não tinha começado (medido em produção em 04/10/2026: gasto do dia
 * rodando e o cartão em zero). Aqui "meia-noite", "dia 1" e "ontem" são contados
 * no fuso que a organização escolheu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { FUSO_PADRAO, fusoUtilizavel } from "@/lib/tempo/fusos";

export interface Intervalo {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

/** Quanto o relógio de parede do fuso está à frente do UTC naquele instante, em ms. */
function deslocamento(instante: Date, fuso: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: fuso,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  const parede = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return parede - Math.floor(instante.getTime() / 1000) * 1000;
}

/** O instante como "relógio de parede" do fuso: uma Date cujos campos UTC são a hora local. */
function paraParede(instante: Date, fuso: string): Date {
  return new Date(instante.getTime() + deslocamento(instante, fuso));
}

/** O caminho de volta. Duas passadas: a segunda acerta a virada de horário de verão. */
function paraInstante(parede: Date, fuso: string): Date {
  const palpite = new Date(parede.getTime() - deslocamento(parede, fuso));
  return new Date(parede.getTime() - deslocamento(palpite, fuso));
}

/** `AAAA-MM-DD` do instante, no fuso dado. */
export function diaNoFuso(instante: Date, fuso: string): string {
  return paraParede(instante, fuso).toISOString().slice(0, 10);
}

export function calcularIntervalo(period: string, now: Date, fuso: string = FUSO_PADRAO): Intervalo {
  // Toda a conta de calendário é feita no relógio de parede (campos UTC = hora local) e só o resultado
  // volta a ser instante.
  const fim = paraParede(now, fuso);
  const inicio = new Date(fim);
  const meiaNoite = (d: Date) => d.setUTCHours(0, 0, 0, 0);
  const fimDoDia = (d: Date) => d.setUTCHours(23, 59, 59, 999);

  if (period === "today") {
    meiaNoite(inicio);
  } else if (period === "yesterday") {
    inicio.setUTCDate(inicio.getUTCDate() - 1);
    meiaNoite(inicio);
    fim.setUTCDate(fim.getUTCDate() - 1);
    fimDoDia(fim);
  } else if (period === "30d") {
    inicio.setUTCDate(inicio.getUTCDate() - 30);
  } else if (period === "this_month") {
    inicio.setUTCDate(1);
    meiaNoite(inicio);
  } else if (period === "last_month") {
    inicio.setUTCDate(1);
    inicio.setUTCMonth(inicio.getUTCMonth() - 1);
    meiaNoite(inicio);
    fim.setUTCDate(0);
    fimDoDia(fim);
  } else {
    // "7d" e o padrão: 7 dias.
    inicio.setUTCDate(inicio.getUTCDate() - 7);
  }

  const start = paraInstante(inicio, fuso);
  const end = paraInstante(fim, fuso);
  const duracaoMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duracaoMs);

  return { start, end, prevStart, prevEnd };
}

/**
 * O fuso da organização para as telas de resultado. Nunca lança: erro de leitura ou fuso que o `Intl`
 * recusa caem no padrão do produto — uma hora de diferença é melhor que um painel que não abre.
 */
export async function lerFusoDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<string> {
  try {
    const { data } = await db.from("organizations").select("timezone").eq("id", organizationId).maybeSingle();
    return fusoUtilizavel((data as { timezone?: string | null } | null)?.timezone);
  } catch {
    return FUSO_PADRAO;
  }
}

export function calcularDelta(atual: number, anterior: number): number {
  if (anterior === 0) return atual > 0 ? 100 : 0;
  return Number((((atual - anterior) / anterior) * 100).toFixed(1));
}
