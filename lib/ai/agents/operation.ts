import type { Queryable } from "@/lib/agent-engine/queue/queue";
import type { SupabaseClient } from "@supabase/supabase-js";
import { StaleServiceBoundaryError } from "@/lib/atendimento/fronteira";
export interface AgentOperationContext {
  organizationId: string;
  agentId: string;
  versionId: string;
  revision: string;
}
/**
 * A VERSÃO DO AGENTE FOI TROCADA NO MEIO DO TURNO, e ele continua em operação.
 *
 * ⚠️ Medido em produção em 11/10/2026: nas três publicações do dia (12:52, 15:13 e 15:15 UTC), os
 * turnos que estavam em andamento — seis, em quatro conversas — foram cancelados de vez
 * (`service_boundary_stale`). Ninguém respondeu àquelas mensagens: cada pessoa só foi atendida
 * quando escreveu de novo, de 9 a 30 minutos depois. Publicar roteiro é rotina de quem afina o
 * agente, e cada publicação deixava quem escreveu naquele minuto sem resposta.
 *
 * É subclasse de propósito: todo ponto que já trata `StaleServiceBoundaryError` (não enviar,
 * repassar o erro) continua tratando igual. Só o worker distingue, para devolver o turno à fila —
 * ele roda de novo inteiro, já com a versão publicada.
 */
export class AgentVersionReplacedError extends StaleServiceBoundaryError {
  constructor() {
    super();
    this.name = "AgentVersionReplacedError";
    this.message = "agent_version_replaced";
  }
}
function assert(
  row:
    | {
        published_version_id: string | null;
        operation_revision: number | string;
        operation_mode: string;
        paused_at: string | null;
        archived_at: string | null;
      }
    | undefined
    | null,
  c: AgentOperationContext,
) {
  // Agente fora de operação (pausado, arquivado, tirado do automático): o turno não envia e não volta.
  if (!row || row.operation_mode !== "automatic" || row.paused_at || row.archived_at || !row.published_version_id)
    throw new StaleServiceBoundaryError();
  // Agente EM operação, só que noutra versão: o turno não envia com o roteiro velho, mas a pessoa
  // continua esperando — ver `AgentVersionReplacedError`.
  if (row.published_version_id !== c.versionId || String(row.operation_revision) !== c.revision)
    throw new AgentVersionReplacedError();
}
export async function assertAgentOperationPg(db: Queryable, c: AgentOperationContext) {
  const { rows } = await db.query<NonNullable<Parameters<typeof assert>[0]>>(
    "select published_version_id,operation_revision::text,operation_mode,paused_at,archived_at from ai_agents where organization_id=$1 and id=$2",
    [c.organizationId, c.agentId],
  );
  assert(rows[0], c);
}
export async function assertAgentOperationSupabase(db: SupabaseClient, c: AgentOperationContext) {
  const { data, error } = await db
    .from("ai_agents")
    .select("published_version_id,operation_revision,operation_mode,paused_at,archived_at")
    .eq("organization_id", c.organizationId)
    .eq("id", c.agentId)
    .maybeSingle();
  if (error) throw error;
  assert(data, c);
}
