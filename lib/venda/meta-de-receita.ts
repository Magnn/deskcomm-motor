/**
 * A META DE RECEITA EM CASCATA — trimestre, mês, semana e dia — e o RITMO de cada recorte.
 *
 * A organização grava uma meta mensal em reais (e, se quiser, uma trimestral diferente de 3×) em
 * `organizations.settings.metas`. Daqui saem as metas do dia e da semana: o mês é repartido pelos
 * dias com o PESO de cada dia da semana medido no histórico (sábado que vende menos pede menos),
 * puxado pela metade para o uniforme — semana ruim não vira regra.
 *
 * Ritmo = feito ÷ previsto até agora. É o termômetro que o painel "Escalar" e o relatório do dia
 * mostram. Nada aqui entra no prompt do agente: a cliente nunca sente a meta.
 *
 * Tudo puro, em dias locais `YYYY-MM-DD` (quem chama converte no fuso da organização).
 */
import { z } from "zod";

export const metasSchema = z
  .object({
    receita_mensal_cents: z.number().int().min(100).max(10_000_000_000),
    receita_trimestral_cents: z.number().int().min(100).max(30_000_000_000).optional(),
    /** Alvos do plano (a tela parte dos números de hoje quando faltam). */
    alvo_conversao_pct: z.number().min(0.1).max(100).optional(),
    alvo_por_compradora_cents: z.number().int().min(100).max(100_000_000).optional(),
    /** Números novos que a organização vai ligar (entram na conta de contatos por número). */
    numeros_planejados: z.number().int().min(0).max(50).optional(),
  })
  .strict();
export type Metas = z.infer<typeof metasSchema>;

export function lerMetas(settings: unknown): Metas | null {
  const bruto = (settings as { metas?: unknown } | null | undefined)?.metas;
  const r = metasSchema.safeParse(bruto);
  return r.success ? r.data : null;
}

export type Ritmo = "adiantada" | "no_ritmo" | "atrasada";

export interface Recorte {
  inicio: string;
  fim: string;
  meta: number;
  feito: number;
  /** Quanto já devia ter entrado até agora, pelos pesos dos dias. */
  previsto: number;
  ritmo: Ritmo;
  /** Fechamento do recorte se o ritmo de hoje continuar. */
  projecao: number;
}

export interface PlanoDaMeta {
  dia: Recorte;
  semana: Recorte;
  mes: Recorte;
  trimestre: Recorte;
  /** O que falta no mês dividido pelos dias que sobram (hoje incluído). */
  faltaPorDia: number;
  diasQueFaltam: number;
}

// ---- calendário em dias locais ----
const emData = (dia: string) => new Date(`${dia}T00:00:00Z`);
const paraDia = (d: Date) => d.toISOString().slice(0, 10);
export const somarDias = (dia: string, n: number) => paraDia(new Date(emData(dia).getTime() + n * 86_400_000));
const diaDaSemana = (dia: string) => emData(dia).getUTCDay();
const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
const partes = (dia: string) => ({ ano: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) });
const dois = (n: number) => String(n).padStart(2, "0");

export function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}

/**
 * Peso de cada dia da semana (domingo = 0), média 1. Vem da receita dos dias pedidos (o histórico);
 * com menos de 4 semanas ou sem venda nenhuma, é uniforme. Puxado pela metade para o 1.
 */
export function pesosPorDiaDaSemana(receitaPorDia: ReadonlyMap<string, number>, dias: readonly string[]): number[] {
  const uniforme = [1, 1, 1, 1, 1, 1, 1];
  if (dias.length < 28) return uniforme;
  const soma = [0, 0, 0, 0, 0, 0, 0];
  const conta = [0, 0, 0, 0, 0, 0, 0];
  for (const d of dias) {
    const w = diaDaSemana(d);
    soma[w] = (soma[w] ?? 0) + (receitaPorDia.get(d) ?? 0);
    conta[w] = (conta[w] ?? 0) + 1;
  }
  const medias = soma.map((s, i) => ((conta[i] ?? 0) > 0 ? s / (conta[i] ?? 1) : 0));
  const geral = medias.reduce((a, b) => a + b, 0) / 7;
  if (geral <= 0) return uniforme;
  return medias.map((m) => 0.5 + 0.5 * (m / geral));
}

/** A meta de um dia: a do mês dele repartida pelos pesos. */
export function metaDoDia(dia: string, metaMensal: number, pesos: readonly number[]): number {
  const { ano, mes } = partes(dia);
  let total = 0;
  for (let d = 1; d <= diasNoMes(ano, mes); d += 1) total += pesos[diaDaSemana(`${ano}-${dois(mes)}-${dois(d)}`)] ?? 1;
  return total > 0 ? (metaMensal * (pesos[diaDaSemana(dia)] ?? 1)) / total : 0;
}

export function ritmoDe(feito: number, previsto: number): Ritmo {
  if (previsto <= 0) return feito > 0 ? "adiantada" : "no_ritmo";
  const r = feito / previsto;
  return r >= 1.05 ? "adiantada" : r >= 0.9 ? "no_ritmo" : "atrasada";
}

export interface EntradaDoPlano {
  metas: Pick<Metas, "receita_mensal_cents" | "receita_trimestral_cents">;
  /** Hoje, no fuso da organização. */
  hoje: string;
  /** Quanto do dia de hoje já passou (0–1). */
  fracaoDoDia: number;
  receitaPorDia: ReadonlyMap<string, number>;
  pesos: readonly number[];
}

export function planoDaMeta(e: EntradaDoPlano): PlanoDaMeta {
  const mensal = e.metas.receita_mensal_cents;
  // Trimestral diferente de 3× o mês escala os dias do trimestre na mesma proporção.
  const fatorTri = e.metas.receita_trimestral_cents ? e.metas.receita_trimestral_cents / (3 * mensal) : 1;
  const fracao = Math.min(1, Math.max(0, e.fracaoDoDia));
  const { ano, mes } = partes(e.hoje);

  const recorte = (inicio: string, fim: string, fator: number): Recorte => {
    let meta = 0;
    let previsto = 0;
    let feito = 0;
    for (const d of diasEntre(inicio, fim)) {
      const m = metaDoDia(d, mensal, e.pesos) * fator;
      meta += m;
      if (d < e.hoje) previsto += m;
      else if (d === e.hoje) previsto += m * fracao;
      if (d <= e.hoje) feito += e.receitaPorDia.get(d) ?? 0;
    }
    const razao = previsto > 0 ? feito / previsto : 1;
    const projecao = Math.round(feito + Math.max(0, meta - previsto) * razao);
    return { inicio, fim, meta: Math.round(meta), feito, previsto: Math.round(previsto), ritmo: ritmoDe(feito, previsto), projecao };
  };

  const segunda = somarDias(e.hoje, -((diaDaSemana(e.hoje) + 6) % 7));
  const triInicio = Math.floor((mes - 1) / 3) * 3 + 1;
  const mesInicio = `${ano}-${dois(mes)}-01`;
  const mesFim = `${ano}-${dois(mes)}-${dois(diasNoMes(ano, mes))}`;
  const triFimMes = triInicio + 2;

  const doMes = recorte(mesInicio, mesFim, 1);
  const diasQueFaltam = diasEntre(e.hoje, mesFim).length;
  return {
    dia: recorte(e.hoje, e.hoje, 1),
    semana: recorte(segunda, somarDias(segunda, 6), 1),
    mes: doMes,
    trimestre: recorte(`${ano}-${dois(triInicio)}-01`, `${ano}-${dois(triFimMes)}-${dois(diasNoMes(ano, triFimMes))}`, fatorTri),
    faltaPorDia: Math.max(0, Math.round((doMes.meta - doMes.feito) / diasQueFaltam)),
    diasQueFaltam,
  };
}

// ---- a conta da meta: contatos × conversão × gasto por compradora ----

export interface FunilDoMes {
  contatos: number;
  compradoras: number;
  receita: number;
}

/** O mês inteiro se o ritmo de contatos e de receita dos dias corridos continuar. */
export function projetarMes(f: FunilDoMes, diasCorridos: number, diasDoMes: number): FunilDoMes {
  const k = diasCorridos > 0 ? diasDoMes / diasCorridos : 1;
  return { contatos: Math.round(f.contatos * k), compradoras: Math.round(f.compradoras * k), receita: Math.round(f.receita * k) };
}

export const conversaoDe = (f: FunilDoMes) => (f.contatos > 0 ? f.compradoras / f.contatos : 0);
export const porCompradoraDe = (f: FunilDoMes) => (f.compradoras > 0 ? f.receita / f.compradoras : 0);

/** Contatos novos por mês que a meta pede com a conversão e o gasto por compradora dados. */
export function contatosParaAMeta(metaMensal: number, conversao: number, porCompradora: number): number | null {
  const porContato = conversao * porCompradora;
  return porContato > 0 ? Math.ceil(metaMensal / porContato) : null;
}
