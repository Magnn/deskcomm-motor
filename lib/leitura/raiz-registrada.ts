/**
 * A CAUSA RAIZ DITA, REGISTRADA — e não deduzida de "a pessoa falou e a agente respondeu".
 *
 * ─── O que se via ────────────────────────────────────────────────────────────────────────────────
 * Depois da 3ª carta, `passoDaLeitura` dava a raiz por dita quando havia uma resposta da pessoa seguida
 * de QUALQUER resposta da agente. Uma dúvida ("o que é o Enforcado?") respondida virava "raiz dita": a
 * leitura passava a `encerrada` e a raiz — o passo que liga as cartas ao trabalho — nunca saía.
 *
 * ─── Como ────────────────────────────────────────────────────────────────────────────────────────
 * Quem sabe se disse a raiz é a agente: no turno da raiz ela escreve a marca `[[RAIZ_DITA]]` no fim. O
 * envio tira a marca do texto e grava a hora em `conversations.metadata.leitura.raiz_dita_em` (lista,
 * uma por rodada). Uma resposta a dúvida sai sem a marca e a etapa continua aberta.
 *
 * Duas redes de segurança, em `passoDaLeitura`: (1) se a agente falou DUAS vezes depois da resposta à 3ª
 * carta sem marcar, a etapa fecha mesmo assim — a leitura nunca fica presa num modelo que esquece a
 * marca; (2) a resposta da agente anterior a `REGISTRO_DA_RAIZ_DESDE` segue a regra antiga, para as
 * conversas que já estavam no meio quando o registro entrou.
 */
import type pg from "pg";

export const MARCA_DA_RAIZ = "[[RAIZ_DITA]]";

// shortcut: data fixa da entrada do registro; pode sair quando nenhuma leitura aberta for anterior a ela.
export const REGISTRO_DA_RAIZ_DESDE = new Date("2026-11-23T00:00:00Z");

export function temMarcaDaRaiz(texto: string): boolean {
  return texto.includes(MARCA_DA_RAIZ);
}

/** O texto sem a marca, sem sobra de espaço ou de bolha vazia. Puro. */
export function semAMarcaDaRaiz(texto: string): string {
  return texto
    .split(MARCA_DA_RAIZ)
    .join("")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** As horas em que a raiz foi registrada nesta conversa. Falha de leitura = nenhuma (a rede de 2 turnos segura). */
export async function lerRaizesDitas(
  pool: pg.Pool,
  args: { organizationId: string; conversationId: string | null },
): Promise<Date[]> {
  if (!args.conversationId) return [];
  try {
    const { rows } = await pool.query<{ em: string }>(
      `select jsonb_array_elements_text(coalesce(metadata->'leitura'->'raiz_dita_em', '[]'::jsonb)) as em
         from conversations where organization_id = $1 and id = $2`,
      [args.organizationId, args.conversationId],
    );
    return rows.map((r) => new Date(r.em)).filter((d) => !Number.isNaN(d.getTime()));
  } catch {
    return [];
  }
}

export async function registrarRaizDita(
  pool: pg.Pool,
  args: { organizationId: string; conversationId: string; agora?: Date },
): Promise<void> {
  await pool.query(
    `update conversations
        set metadata = jsonb_set(
              jsonb_set(coalesce(metadata, '{}'::jsonb), '{leitura}', coalesce(metadata->'leitura', '{}'::jsonb)),
              '{leitura,raiz_dita_em}',
              coalesce(metadata->'leitura'->'raiz_dita_em', '[]'::jsonb) || to_jsonb($3::text))
      where organization_id = $1 and id = $2`,
    [args.organizationId, args.conversationId, (args.agora ?? new Date()).toISOString()],
  );
}
