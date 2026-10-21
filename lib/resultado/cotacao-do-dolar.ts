/**
 * A COTAÇÃO DO DÓLAR PARA O LUCRO — a PTAX de venda do Banco Central, o câmbio oficial publicado todo dia útil.
 *
 * O custo de IA é cobrado em dólar (`custo-de-ia.ts`) e o lucro do painel é em real. Converter com um número
 * escrito à mão seria inventar; a PTAX é a referência pública que qualquer um confere. A leitura pega a última
 * cotação dos últimos 7 dias (fim de semana e feriado não têm PTAX) e guarda 6 horas em memória.
 *
 * Desconhecido não vira cotação: se o Banco Central não responder, volta `null` e o lucro não desconta a IA —
 * o painel diz isso, em vez de mostrar um lucro com aparência de certo.
 */

export interface CotacaoDoDolar {
  /** Reais por dólar (PTAX de venda). */
  reais: number;
  /** O dia da cotação, `AAAA-MM-DD`. */
  dia: string;
}

const VALIDADE_MS = 6 * 3_600_000;
const TEMPO_MAXIMO_MS = 3_000;
let guardada: { ate: number; valor: CotacaoDoDolar | null } | null = null;

/** Só para os testes: o cache é do processo. */
export function limparCacheDaCotacao(): void {
  guardada = null;
}

function mmddaaaa(d: Date): string {
  return `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;
}

/** O endereço do serviço PTAX (OData do Banco Central) para os 7 dias até `agora`. Pura. */
export function enderecoDaPtax(agora: Date): string {
  const inicio = new Date(agora.getTime() - 7 * 86_400_000);
  return (
    "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
    "CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)" +
    `?@dataInicial='${mmddaaaa(inicio)}'&@dataFinalCotacao='${mmddaaaa(agora)}'&$format=json&$select=cotacaoVenda,dataHoraCotacao`
  );
}

/** A última cotação válida da resposta do serviço. `null` se não houver nenhuma. Pura. */
export function ultimaCotacao(corpo: unknown): CotacaoDoDolar | null {
  const linhas = (corpo as { value?: unknown } | null)?.value;
  if (!Array.isArray(linhas)) return null;
  for (let i = linhas.length - 1; i >= 0; i--) {
    const l = linhas[i] as { cotacaoVenda?: unknown; dataHoraCotacao?: unknown };
    const v = Number(l.cotacaoVenda);
    if (Number.isFinite(v) && v > 0 && typeof l.dataHoraCotacao === "string") {
      return { reais: v, dia: l.dataHoraCotacao.slice(0, 10) };
    }
  }
  return null;
}

export async function lerCotacaoDoDolar(
  agora: Date = new Date(),
  buscar: typeof fetch = fetch,
): Promise<CotacaoDoDolar | null> {
  if (guardada && guardada.ate > agora.getTime()) return guardada.valor;
  let valor: CotacaoDoDolar | null = null;
  try {
    const resposta = await buscar(enderecoDaPtax(agora), { signal: AbortSignal.timeout(TEMPO_MAXIMO_MS) });
    if (resposta.ok) valor = ultimaCotacao(await resposta.json());
  } catch {
    valor = null;
  }
  // Falha guarda por menos tempo: o Banco Central volta, e o painel não deve ficar 6 h sem a cotação.
  guardada = { ate: agora.getTime() + (valor === null ? 10 * 60_000 : VALIDADE_MS), valor };
  return valor;
}

/**
 * O lucro com a IA descontada, em real. Sem consumo lido ou sem cotação, o lucro volta como veio e
 * `descontaIa` é falso — o painel diz que a IA não foi descontada. Pura.
 */
export function descontarIa(
  lucro: number,
  custoIaCentavosDeDolar: number | null,
  cotacao: CotacaoDoDolar | null,
): { lucro: number; custoIaReais: number | null; descontaIa: boolean } {
  if (custoIaCentavosDeDolar === null || cotacao === null) return { lucro, custoIaReais: null, descontaIa: false };
  const custoIaReais = Math.round((custoIaCentavosDeDolar / 100) * cotacao.reais * 100) / 100;
  return { lucro: Math.round((lucro - custoIaReais) * 100) / 100, custoIaReais, descontaIa: true };
}
