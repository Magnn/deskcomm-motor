/**
 * O RITMO DO MÊS PARA O MOTOR — a mesma régua do painel Escalar (`planoDaMeta`), lida por SQL para o worker,
 * que não tem o cliente do Supabase. Só a receita do pagamento (cobranças sem estorno), que é onde o agente vende.
 *
 * Quem usa: a oferta proativa, que liga a alavanca de receita quando o mês está atrasado
 * (`lib/oferta-proativa/decisao.ts`). O ritmo NUNCA vai para o texto do agente.
 *
 * shortcut: soma por SQL e ignora ajustes parciais (`adjustment`), que o painel desconta; a diferença é de centavos
 * e só decide entre "atrasada" e "no ritmo". Trocar por uma leitura única se os ajustes passarem a pesar.
 */
import type pg from "pg";

import { diaLocalISO, partesNoFuso } from "@/lib/agenda/fuso";

import { diasEntre, lerMetas, pesosPorDiaDaSemana, planoDaMeta, somarDias, type Ritmo } from "./meta-de-receita";

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { em: number; ritmo: Ritmo | null }>();

export async function lerRitmoDoMes(
  pool: Pick<pg.Pool, "query">,
  organizationId: string,
  fuso: string,
  agora: Date = new Date(),
): Promise<Ritmo | null> {
  const guardado = cache.get(organizationId);
  if (guardado && agora.getTime() - guardado.em < CACHE_MS) return guardado.ritmo;
  try {
    const { rows: org } = await pool.query<{ settings: unknown }>(`select settings from organizations where id = $1`, [organizationId]);
    const metas = lerMetas(org[0]?.settings);
    let ritmo: Ritmo | null = null;
    if (metas) {
      const { rows } = await pool.query<{ dia: string; centavos: string | number }>(
        `select to_char(l.occurred_at at time zone $2, 'YYYY-MM-DD') as dia, sum(l.amount_cents)::bigint as centavos
           from revenue_ledger l
          where l.organization_id = $1 and l.event_type = 'charge' and l.amount_cents > 0
            and l.occurred_at > now() - interval '100 days'
            and not exists (select 1 from revenue_ledger e where e.organization_id = l.organization_id
                             and e.event_type in ('refund', 'chargeback') and e.external_event_id = l.external_event_id)
          group by 1`,
        [organizationId, fuso],
      );
      const receitaPorDia = new Map(rows.map((r) => [r.dia, Number(r.centavos)] as const));
      const hoje = diaLocalISO(agora, fuso);
      const p = partesNoFuso(agora, fuso);
      const pesos = pesosPorDiaDaSemana(receitaPorDia, diasEntre(somarDias(hoje, -56), somarDias(hoje, -1)));
      ritmo = planoDaMeta({ metas, hoje, fracaoDoDia: (p.hora * 60 + p.minuto) / 1440, receitaPorDia, pesos }).mes.ritmo;
    }
    cache.set(organizationId, { em: agora.getTime(), ritmo });
    return ritmo;
  } catch {
    return null;
  }
}
