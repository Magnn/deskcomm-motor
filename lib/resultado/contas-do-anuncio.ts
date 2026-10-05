/**
 * ROAS E LUCRO DO PERÍODO — a conta entre o que entrou e o que o anúncio custou.
 *
 * Pura. A regra que importa: sem gasto CONHECIDO, na MESMA moeda do faturamento, não existe ROAS. O
 * painel mostrava `0.00` nesse caso, que se lê como "o anúncio não trouxe nada" quando a verdade é "não
 * sei quanto o anúncio custou".
 */
export type GastoDoPeriodo =
  | { estado: "ok"; centavos: number; moeda: string }
  | { estado: "sem_conexao" | "sem_conta" | "indisponivel" | "restrito" };

export interface ContasDoAnuncio {
  /** O gasto na moeda da conta, em unidades (não centavos). `null` = desconhecido. */
  gasto: number | null;
  moeda: string | null;
  estado: GastoDoPeriodo["estado"];
  /** Faturamento ÷ gasto. `null` quando o gasto é desconhecido, zero, ou em outra moeda. */
  roas: number | null;
  /** Faturamento − gasto quando o gasto entra na conta; senão, o próprio faturamento. */
  lucro: number;
  /** O gasto entrou no ROAS e no lucro? Falso = os dois não descontam anúncio. */
  gastoNaConta: boolean;
}

export function contasDoAnuncio(faturamento: number, gasto: GastoDoPeriodo, moedaDoFaturamento = "BRL"): ContasDoAnuncio {
  if (gasto.estado !== "ok") {
    return { gasto: null, moeda: null, estado: gasto.estado, roas: null, lucro: faturamento, gastoNaConta: false };
  }
  const valor = gasto.centavos / 100;
  const mesmaMoeda = gasto.moeda === moedaDoFaturamento;
  return {
    gasto: valor,
    moeda: gasto.moeda,
    estado: "ok",
    roas: mesmaMoeda && valor > 0 ? Number((faturamento / valor).toFixed(2)) : null,
    lucro: mesmaMoeda ? faturamento - valor : faturamento,
    gastoNaConta: mesmaMoeda,
  };
}
