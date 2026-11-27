/**
 * QUANTO CADA OFERTA PROATIVA RENDE — receita que entrou até 3 dias depois de cada oferta, por oferta enviada.
 *
 * É a régua da alavanca de receita (`escolherOferta` com o mês atrasado): entre as ofertas que cabem na pessoa,
 * vai primeiro a que rende mais. Medido em produção em 27/11/2026 (30 dias): a Pergunta nova saiu 1.320 vezes e
 * rendeu R$ 1,27 por oferta; a recompra do trabalho, R$ 35; a Sinastria, R$ 10.
 *
 * Atribuição simples e declarada: toda cobrança da pessoa nos 3 dias seguintes conta para a oferta, mesmo que seja
 * outro produto — a oferta reabriu a conversa. Só entram ofertas com a janela de 3 dias já fechada (de 33 a 3 dias
 * atrás), senão a oferta de ontem pareceria não render nada.
 *
 * Oferta com pouco envio não é julgada pelo acaso: o valor é puxado para a média de todas as ofertas com o peso de
 * `PESO_DA_MEDIA` envios. Oferta nunca enviada vale a média — e assim é testada.
 */
import type pg from "pg";

export const PESO_DA_MEDIA = 20;

export interface LinhaDoDesempenho {
  id: string;
  ofertas: number;
  /** Centavos que entraram até 3 dias depois, somados. */
  receita: number;
}

export interface DesempenhoDasOfertas {
  linhas: LinhaDoDesempenho[];
  /** Receita média por oferta, de todas. */
  media: number;
  /** Valor esperado por oferta, já puxado para a média. */
  valor: ReadonlyMap<string, number>;
}

export function desempenhoDe(linhas: readonly LinhaDoDesempenho[]): DesempenhoDasOfertas {
  const total = linhas.reduce((s, l) => s + l.ofertas, 0);
  const media = total > 0 ? linhas.reduce((s, l) => s + l.receita, 0) / total : 0;
  const valor = new Map(linhas.map((l) => [l.id, (l.receita + PESO_DA_MEDIA * media) / (l.ofertas + PESO_DA_MEDIA)] as const));
  return { linhas: [...linhas].sort((a, b) => b.ofertas - a.ofertas), media, valor };
}

/** O valor esperado de uma oferta: o medido, ou a média para a que nunca saiu. */
export const valorDaOferta = (d: DesempenhoDasOfertas, id: string): number => d.valor.get(id) ?? d.media;

export const CONSULTA_DO_DESEMPENHO = `
  with j as (
    select q.contact_id, q.created_at, q.payload->'oferta_proativa'->>'id' as id
      from job_queue q
     where q.organization_id = $1 and q.kind = 'followup_turn' and q.payload ? 'oferta_proativa'
       and q.created_at between now() - interval '33 days' and now() - interval '3 days')
  select j.id, count(*)::int as ofertas,
         coalesce(sum((select coalesce(sum(l.amount_cents), 0) from revenue_ledger l
                         where l.organization_id = $1 and l.contact_id = j.contact_id
                           and l.event_type = 'charge' and l.amount_cents > 0
                           and l.occurred_at between j.created_at and j.created_at + interval '3 days'
                           and not exists (select 1 from revenue_ledger e
                                            where e.organization_id = l.organization_id
                                              and e.event_type in ('refund', 'chargeback')
                                              and e.external_event_id = l.external_event_id))), 0)::bigint as receita
    from j where j.id is not null
   group by j.id`;

const CACHE_MS = 30 * 60 * 1000;
const cache = new Map<string, { em: number; d: DesempenhoDasOfertas }>();

/** Lê (guardado 30 min por organização). Falha = `null`: sem a régua, a escolha segue a de sempre. */
export async function lerDesempenhoDasOfertas(
  pool: Pick<pg.Pool, "query">,
  organizationId: string,
  agora: Date = new Date(),
): Promise<DesempenhoDasOfertas | null> {
  const guardado = cache.get(organizationId);
  if (guardado && agora.getTime() - guardado.em < CACHE_MS) return guardado.d;
  try {
    const { rows } = await pool.query<{ id: string; ofertas: number; receita: string | number }>(CONSULTA_DO_DESEMPENHO, [organizationId]);
    const d = desempenhoDe(rows.map((r) => ({ id: r.id, ofertas: Number(r.ofertas), receita: Number(r.receita) })));
    cache.set(organizationId, { em: agora.getTime(), d });
    return d;
  } catch {
    return null;
  }
}
