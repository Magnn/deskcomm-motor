/**
 * A FRANQUIA DE CONVERSAS DO PLANO E O EXCEDENTE.
 *
 * O plano inclui N conversas atendidas pela IA por ciclo de cobrança (`Plano.conversasMensais`). O que passar
 * disso é cobrado por conversa na fatura da assinatura, pela cobrança por uso da Stripe (um "medidor"). Quem
 * informa o consumo é o cron `excedente-de-conversas`: ele conta as conversas do ciclo, calcula o excedente e
 * manda à Stripe só a DIFERENÇA desde o último informe, guardada em
 * `organization_subscriptions.excedente_informado` (migration 0936). Informar o total de novo dobraria a conta.
 *
 * O ciclo é o da ASSINATURA na Stripe (do dia em que a empresa assinou ao mesmo dia do mês seguinte), não o
 * mês do calendário: a Stripe soma o medidor por ciclo, e contar por outro recorte faria a conversa 301 de um
 * mês cair na fatura do outro.
 *
 * "Conversa atendida pela IA" = conversa com ao menos uma mensagem que saiu com `sent_via = 'ai'` no ciclo — a
 * mesma régua da tela "o que a plataforma trouxe" (`lib/resultado/retorno-da-plataforma.ts`).
 *
 * As contas são puras; só `conversasNoCiclo` toca o banco.
 */
import type pg from "pg";

/** Quantas conversas passaram da franquia. Franquia 0 = o plano não mede em conversas: nada é excedente. */
export function excedenteDoCiclo(usadas: number, franquia: number): number {
  if (franquia <= 0) return 0;
  return Math.max(0, usadas - franquia);
}

/**
 * Quanto informar à Stripe agora: o excedente de hoje menos o que já foi informado NESTE ciclo. Ciclo novo zera
 * o informado. Nunca negativo — conversa não "desacontece" (uma conversa apagada não devolve cobrança).
 */
export function aInformar(p: { excedente: number; ciclo: string; cicloInformado: string | null; jaInformado: number }): number {
  const base = p.cicloInformado === p.ciclo ? p.jaInformado : 0;
  return Math.max(0, p.excedente - base);
}

/**
 * A chave do informe na Stripe. A Stripe descarta um segundo evento com a mesma chave: se a rodada cair entre
 * informar e gravar, a seguinte manda o mesmo total com a mesma chave e não cobra duas vezes.
 */
export function chaveDoInforme(organizationId: string, ciclo: string, excedenteTotal: number): string {
  return `excedente-${organizationId}-${ciclo.slice(0, 10)}-${excedenteTotal}`;
}

/** Conversas atendidas pela IA no ciclo. */
export async function conversasNoCiclo(pool: pg.Pool, organizationId: string, inicio: Date, fim: Date): Promise<number> {
  const { rows } = await pool.query<{ n: string | number }>(
    `select count(distinct conversation_id) as n
       from messages
      where organization_id = $1 and direction = 'outbound' and sent_via = 'ai'
        and created_at >= $2 and created_at < $3`,
    [organizationId, inicio, fim],
  );
  return Number(rows[0]?.n ?? 0);
}
