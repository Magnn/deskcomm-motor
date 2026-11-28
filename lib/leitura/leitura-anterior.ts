/**
 * A leitura grátis que a pessoa JÁ teve com a empresa: a primeira "CARTA 1:" que a agente enviou a este contato numa
 * OUTRA conversa (outro número) ou há mais de `LEITURA_ANTERIOR_HORAS` nesta. É o fato que a porta de entrada
 * `leitura_gratis_so_primeira` lê (`lib/preco/porta-de-entrada.ts`). Falha de leitura = `null` (nunca nega a leitura
 * grátis por erro de banco).
 */
import type pg from "pg";

import { LEITURA_ANTERIOR_HORAS } from "@/lib/preco/porta-de-entrada";

export async function lerLeituraAnterior(
  pool: pg.Pool,
  args: { organizationId: string; contactId: string; conversationId: string },
): Promise<Date | null> {
  try {
    const { rows } = await pool.query<{ em: Date | null }>(
      `select min(m.created_at) as em
         from messages m
         join conversations c on c.id = m.conversation_id and c.organization_id = m.organization_id
        where m.organization_id = $1
          and c.contact_id = $2
          and m.direction = 'outbound'
          and m.body ~ '^CARTA\s+1:'
          and (m.conversation_id <> $3 or m.created_at < now() - make_interval(hours => $4))`,
      [args.organizationId, args.contactId, args.conversationId, LEITURA_ANTERIOR_HORAS],
    );
    return rows[0]?.em ? new Date(rows[0].em) : null;
  } catch {
    return null;
  }
}
