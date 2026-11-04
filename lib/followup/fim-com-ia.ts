/**
 * O FIM DO FLUXO ENTREGA À IA — a caixa Fim com «Ao finalizar: IA» pede um turno da agente, com a instrução escrita
 * na caixa.
 *
 * ─── O caso que fez este arquivo existir ─────────────────────────────────────────────
 * A opção existe no construtor desde o roteiro de atendimento (`endFinishSchema`), mas o motor do fluxo de
 * acompanhamento a ignorava: o Fim só concluía a inscrição (`node-handlers.ts`, `case "end"`). Medido em produção em
 * 04/11/2026, no funil de entrada CIGANA TAROT: quem parava de responder recebia o lembrete pronto, a inscrição
 * esgotava e ninguém mais falava com a pessoa. A caixa "A Cigana assume", com a instrução escrita pelo dono, não fazia
 * nada além do que o fim sem instrução já fazia.
 *
 * ─── O que faz ───────────────────────────────────────────────────────────────────────
 * Duas formas de terminar, dois caminhos:
 *  - a ÚLTIMA palavra é da pessoa, e recente: quem responde é `devolver-a-vez.ts` (a agente responde à mensagem dela).
 *    Aqui não sai nada, senão seriam dois turnos para a mesma conversa;
 *  - a última palavra é NOSSA (a pessoa parou de responder): enfileira um `followup_turn` com a instrução da caixa, e
 *    só se ela escreveu nas últimas 24 h — fora da janela, mensagem automática não sai.
 * Um pedido por inscrição: o mesmo Fim reaplicado (replay, corrida) não pede de novo.
 */
import type { Queryable } from "@/lib/agent-engine/queue/queue";
import { enqueueJob } from "@/lib/agent-engine/queue/queue";
import { readCurrentServiceBoundary } from "@/lib/atendimento/fronteira-server";

import { JANELA_DA_DEVOLUCAO_MINUTOS } from "./devolver-a-vez";
import type { FlowNode } from "./graph-schema";
import type { EnrollmentRow, NodeResult } from "./node-handlers";

/** A chave do pedido no `payload` do job: é por ela que o pedido repetido é reconhecido. */
export const CHAVE_DO_FIM_COM_IA = "fim_do_fluxo";

/** A janela da conversa: depois dela, nenhuma mensagem automática sai. */
export const JANELA_DA_CONVERSA_MS = 24 * 60 * 60 * 1000;

export interface PedidoDeFimComIa {
  organizationId: string;
  contactId: string;
  conversationId: string | null;
  enrollmentId: string;
  nodeId: string;
  instrucao: string;
}

export type DesfechoDoFimComIa =
  | "pedido"
  | "ja_pedido"
  | "ultima_palavra_dela"
  | "sem_mensagem_dela"
  | "fora_da_janela"
  | "sem_atendimento";

const INSTRUCAO_PADRAO =
  "A pessoa parou de responder no fluxo de mensagens prontas. Retome a conversa de onde ela parou, em uma mensagem " +
  "curta e acolhedora, sem repetir o que o fluxo já disse, e termine com uma pergunta simples.";

/** A instrução que vai à agente: a escrita na caixa, ou a padrão quando a caixa não tem texto. */
export function instrucaoDoFimComIa(prompt: string | undefined): string {
  const texto = (prompt ?? "").trim();
  return texto === "" ? INSTRUCAO_PADRAO : texto;
}

/** Pura: o pedido que este passo gera, ou `null` (não é um Fim com IA, ou o passo não concluiu). */
export function pedidoDeFimComIa(enrollment: EnrollmentRow, node: FlowNode, result: NodeResult): PedidoDeFimComIa | null {
  if (node.type !== "end" || result.kind !== "complete") return null;
  const fim = node.config.ao_finalizar;
  if (fim?.tipo !== "ia") return null;
  return {
    organizationId: enrollment.organization_id,
    contactId: enrollment.contact_id,
    conversationId: enrollment.conversation_id,
    enrollmentId: enrollment.id,
    nodeId: node.id,
    instrucao: instrucaoDoFimComIa(fim.prompt),
  };
}

/**
 * Pura: a decisão de pedir o turno, a partir da última mensagem da conversa e da última da pessoa.
 * `ultima` = a mensagem mais recente (de qualquer lado); `ultimaDela` = a inbound mais recente.
 */
export function podePedirTurnoDoFim(
  agora: Date,
  ultima: { direcao: "inbound" | "outbound"; quando: Date } | null,
  ultimaDela: Date | null,
): Exclude<DesfechoDoFimComIa, "pedido" | "ja_pedido" | "sem_atendimento"> | null {
  if (ultimaDela === null) return "sem_mensagem_dela";
  if (agora.getTime() - ultimaDela.getTime() > JANELA_DA_CONVERSA_MS) return "fora_da_janela";
  if (ultima?.direcao === "inbound" && agora.getTime() - ultima.quando.getTime() <= JANELA_DA_DEVOLUCAO_MINUTOS * 60_000) {
    return "ultima_palavra_dela";
  }
  return null;
}

/**
 * Enfileira o turno da agente para o Fim com IA. A conversa é a da inscrição; sem ela, a da mensagem mais recente do
 * contato. Devolve o desfecho para quem chama registrar.
 */
export async function pedirTurnoDoFimComIa(db: Queryable, pedido: PedidoDeFimComIa, agora: Date = new Date()): Promise<DesfechoDoFimComIa> {
  const { rows: jaPedido } = await db.query(
    `select 1 from job_queue
      where organization_id = $1 and contact_id = $2 and kind = 'followup_turn'
        and payload -> '${CHAVE_DO_FIM_COM_IA}' ->> 'enrollment_id' = $3
      limit 1`,
    [pedido.organizationId, pedido.contactId, pedido.enrollmentId],
  );
  if (jaPedido.length > 0) return "ja_pedido";

  const { rows } = await db.query<{ conversation_id: string; direction: string; quando: Date; ultima_dela: Date | null }>(
    `with alvo as (
       select coalesce($3::uuid, (
         select m.conversation_id from messages m
          where m.organization_id = $1 and m.contact_id = $2
          order by coalesce(m.sent_at, m.created_at) desc limit 1)) as conversation_id
     )
     select a.conversation_id, u.direction, u.quando,
            (select max(coalesce(i.sent_at, i.created_at)) from messages i
              where i.organization_id = $1 and i.conversation_id = a.conversation_id and i.direction = 'inbound') as ultima_dela
       from alvo a
       left join lateral (
         select m.direction, coalesce(m.sent_at, m.created_at) as quando from messages m
          where m.organization_id = $1 and m.conversation_id = a.conversation_id
          order by coalesce(m.sent_at, m.created_at) desc, m.created_at desc limit 1
       ) u on true
      where a.conversation_id is not null`,
    [pedido.organizationId, pedido.contactId, pedido.conversationId],
  );
  const conversa = rows[0];
  if (!conversa) return "sem_mensagem_dela";

  const recusa = podePedirTurnoDoFim(
    agora,
    conversa.direction ? { direcao: conversa.direction === "inbound" ? "inbound" : "outbound", quando: new Date(conversa.quando) } : null,
    conversa.ultima_dela ? new Date(conversa.ultima_dela) : null,
  );
  if (recusa !== null) return recusa;

  const fronteira = await readCurrentServiceBoundary(db, pedido.organizationId, conversa.conversation_id);
  if (fronteira === null) return "sem_atendimento";

  await enqueueJob(db, pedido.organizationId, {
    leadId: pedido.contactId,
    kind: "followup_turn",
    maxAttempts: 2,
    payload: {
      reason: pedido.instrucao,
      conversation_id: conversa.conversation_id,
      so_dentro_da_janela: true,
      service_boundary: {
        organization_id: fronteira.organization_id,
        contact_id: fronteira.contact_id,
        conversation_id: fronteira.conversation_id,
        service_revision: fronteira.service_revision,
        demanda_id: fronteira.demanda_id,
        demanda_revision: fronteira.demanda_revision,
      },
      [CHAVE_DO_FIM_COM_IA]: { enrollment_id: pedido.enrollmentId, node_id: pedido.nodeId },
    },
  });
  return "pedido";
}
