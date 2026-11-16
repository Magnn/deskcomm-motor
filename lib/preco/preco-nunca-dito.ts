/**
 * A pessoa NUNCA ouviu valor nenhum da agente, em nenhuma conversa (qualquer número)?
 *
 * Por contato e não por conversa: quem falava no número que caiu e volta por outro abre conversa nova, mas já
 * ouviu preço. Falha de leitura responde `false`, e o turno segue como antes (sem entrada sem preço dito).
 */
import type pg from 'pg';

export async function nuncaOuviuPreco(pool: pg.Pool, organizationId: string, contactId: string): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ ouviu: boolean }>(
      `select exists (
         select 1 from messages m join conversations c on c.id = m.conversation_id
          where c.organization_id = $1 and c.contact_id = $2 and m.organization_id = $1
            and m.direction = 'outbound' and m.body ~ 'R\$\s*[0-9]'
       ) as ouviu`,
      [organizationId, contactId],
    );
    return rows[0]?.ouviu === false;
  } catch {
    return false;
  }
}
