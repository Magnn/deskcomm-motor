/**
 * O QUE A PLATAFORMA TROUXE — o trabalho que o agente fez no período, o dinheiro que entrou, e quanto a
 * empresa pagou à plataforma por isso, lado a lado.
 *
 * Existe porque o produto se vende como "o vendedor de IA" (paga pouco para ter e uma parte quando vende):
 * quem compra resultado precisa VER o resultado contra o custo, ou a assinatura parece despesa.
 *
 * ─── De onde sai cada número ────────────────────────────────────────────────────────────────────
 *   conversas atendidas pela IA → conversas com ao menos uma mensagem que saiu com `sent_via = 'ai'`.
 *   mensagens da IA             → as mensagens que saíram com `sent_via = 'ai'`.
 *   links/Pix enviados          → mensagens que saíram (de qualquer autor) com link ou código Pix de
 *                                 pagamento — o MESMO reconhecimento dos marcos (`LINK_DE_PAGAMENTO`).
 *   vendas pagas e receita      → `revenue_ledger`: `charge` positivo conta como venda; o valor é a soma de
 *                                 tudo no período (estorno, chargeback e ajuste entram negativos).
 *   custo da plataforma         → o plano em vigor, proporcional aos dias do período (preço mensal ÷ 30 por
 *                                 dia), mais a taxa por venda que a Stripe REALMENTE descontou
 *                                 (`metadata.taxa_da_plataforma_cents`, gravada pelo aviso de pagamento).
 *   retorno                     → receita ÷ custo. `null` quando não houve custo (sem plano e sem taxa).
 *
 * As contas são puras; só `lerRetornoDaPlataforma` toca o banco.
 */
import type pg from "pg";

import { LINK_DE_PAGAMENTO } from "@/lib/resultado/marcos";

export interface RetornoDaPlataforma {
  conversasAtendidasPelaIa: number;
  mensagensDaIa: number;
  linksDePagamentoEnviados: number;
  vendasPagas: number;
  receitaCentavos: number;
  custo: {
    /** `null` = a organização não tem plano ativo. */
    plano: { nome: string; precoMensalCentavos: number; noPeriodoCentavos: number } | null;
    taxasCentavos: number;
    totalCentavos: number;
  };
  /** Quantos reais entraram para cada real pago à plataforma. `null` sem custo no período. */
  retornoPorReal: number | null;
  dias: number;
  /** A leitura de links bateu no teto: o período tem mais mensagens do que a tela confere de uma vez. */
  cortado: boolean;
}

export interface FatoDoLivro {
  tipo: string;
  centavos: number;
  taxaCentavos: number | null;
}

const DIA_MS = 86_400_000;

/** Quantos dias o período cobre, contando dia começado como dia (mínimo 1). */
export function diasDoPeriodo(inicio: Date, fim: Date): number {
  return Math.max(1, Math.ceil((fim.getTime() - inicio.getTime()) / DIA_MS));
}

/** O plano proporcional ao período: preço mensal ÷ 30 por dia, arredondado ao centavo. */
export function planoNoPeriodo(precoMensalCentavos: number, dias: number): number {
  return Math.round((precoMensalCentavos * dias) / 30);
}

export function montarRetorno(p: {
  conversasAtendidasPelaIa: number;
  mensagensDaIa: number;
  corposQueSairam: readonly string[];
  fatos: readonly FatoDoLivro[];
  plano: { nome: string; precoMensalCentavos: number } | null;
  dias: number;
  cortado: boolean;
}): RetornoDaPlataforma {
  const links = p.corposQueSairam.filter((c) => LINK_DE_PAGAMENTO.test(c)).length;
  const vendas = p.fatos.filter((f) => f.tipo === "charge" && f.centavos > 0).length;
  const receita = p.fatos.reduce((soma, f) => soma + f.centavos, 0);
  const taxas = p.fatos.reduce((soma, f) => soma + (f.tipo === "charge" && f.taxaCentavos && f.taxaCentavos > 0 ? f.taxaCentavos : 0), 0);
  const plano = p.plano ? { ...p.plano, noPeriodoCentavos: planoNoPeriodo(p.plano.precoMensalCentavos, p.dias) } : null;
  const total = (plano?.noPeriodoCentavos ?? 0) + taxas;
  return {
    conversasAtendidasPelaIa: p.conversasAtendidasPelaIa,
    mensagensDaIa: p.mensagensDaIa,
    linksDePagamentoEnviados: links,
    vendasPagas: vendas,
    receitaCentavos: receita,
    custo: { plano, taxasCentavos: taxas, totalCentavos: total },
    retornoPorReal: total > 0 ? Math.round((receita / total) * 10) / 10 : null,
    dias: p.dias,
    cortado: p.cortado,
  };
}

/** Teto de mensagens conferidas atrás de link num período — o resto é contado como "cortado". */
export const TETO_DE_MENSAGENS = 50_000;

/**
 * Pré-filtro no banco para o reconhecimento de link: só sobem as mensagens que PODEM ter link de pagamento.
 * Tem de ser mais largo que `LINK_DE_PAGAMENTO` — quem decide é a regex de verdade, aqui no código.
 */
const PRE_FILTRO_DE_LINK = "(cakto|mpago|pag\\.ae|stripe\\.com|bcb\\.pix|checkout)";

export async function lerRetornoDaPlataforma(
  pool: pg.Pool,
  organizationId: string,
  periodo: { inicio: Date; fim: Date },
  plano: { nome: string; precoMensalCentavos: number } | null,
): Promise<RetornoDaPlataforma> {
  const [ia, corpos, fatos] = await Promise.all([
    pool.query<{ conversas: string | number; mensagens: string | number }>(
      `select count(distinct conversation_id) as conversas, count(*) as mensagens
         from messages
        where organization_id = $1 and direction = 'outbound' and sent_via = 'ai'
          and created_at >= $2 and created_at < $3`,
      [organizationId, periodo.inicio, periodo.fim],
    ),
    pool.query<{ body: string }>(
      `select body
         from messages
        where organization_id = $1 and direction = 'outbound'
          and created_at >= $2 and created_at < $3
          and body ~* $4
        limit $5`,
      [organizationId, periodo.inicio, periodo.fim, PRE_FILTRO_DE_LINK, TETO_DE_MENSAGENS + 1],
    ),
    pool.query<{ event_type: string; amount_cents: string | number; taxa: string | null }>(
      `select event_type, amount_cents, metadata->>'taxa_da_plataforma_cents' as taxa
         from revenue_ledger
        where organization_id = $1 and occurred_at >= $2 and occurred_at < $3`,
      [organizationId, periodo.inicio, periodo.fim],
    ),
  ]);
  const cortado = corpos.rows.length > TETO_DE_MENSAGENS;
  return montarRetorno({
    conversasAtendidasPelaIa: Number(ia.rows[0]?.conversas ?? 0),
    mensagensDaIa: Number(ia.rows[0]?.mensagens ?? 0),
    corposQueSairam: corpos.rows.slice(0, TETO_DE_MENSAGENS).map((r) => r.body),
    fatos: fatos.rows.map((f) => ({
      tipo: f.event_type,
      centavos: Number(f.amount_cents),
      taxaCentavos: f.taxa !== null && /^\d+$/.test(f.taxa) ? Number(f.taxa) : null,
    })),
    plano,
    dias: diasDoPeriodo(periodo.inicio, periodo.fim),
    cortado,
  });
}
