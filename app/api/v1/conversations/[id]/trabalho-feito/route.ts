import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * /api/v1/conversations/[id]/trabalho-feito — quem é do templo terminou a parte do altar.
 *
 *   POST → confere a janela de 24 h e o aviso repetido e acorda o agente com o motivo; o agente
 *          escreve o aviso à cliente pela cadeia de sempre. A regra mora em `lib/pagamentos/trabalho-feito.ts`.
 *
 * Auth: cookie de sessão, agent+. A conversa é lida com o client do PEDIDO (a política de leitura
 * aplica a visibilidade); a fila é escrita pelo pool do motor com a organização da sessão.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { readCurrentServiceBoundary } from "@/lib/atendimento/fronteira-server";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { enqueueJob } from "@/lib/agent-engine/queue/queue";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import {
  CHAVE_DO_TRABALHO_FEITO,
  MENSAGEM_DA_RECUSA,
  motivoDoTrabalhoFeito,
  podeAvisar,
  trabalhoFeitoSchema,
} from "@/lib/pagamentos/trabalho-feito";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const t = (texto: string) => traduzir(texto, user.idioma);

  const lido = trabalhoFeitoSchema.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) return fail("validation_failed", t("A observação pode ter até 300 caracteres."), 422, { requestId });

  const supabase = await createClient();
  const { data: convData, error: convErr } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (convErr) return fail("internal_error", convErr.message, 500, { requestId });
  const conv = convData as { id: string; contact_id: string | null } | null;
  if (!conv) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
  if (!conv.contact_id) return fail("validation_failed", t("Esta conversa não tem um contato para avisar."), 422, { requestId });

  const pool = getRequestPool();
  const { rows } = await pool.query<{ ultima_dela: Date | null; ultimo_aviso: Date | null }>(
    `select
       (select max(m.created_at) from messages m
         where m.organization_id = $1 and m.conversation_id = $2 and m.direction = 'inbound') as ultima_dela,
       (select max(q.created_at) from job_queue q
         where q.organization_id = $1 and q.contact_id = $3 and q.kind = 'followup_turn'
           and q.payload ? '${CHAVE_DO_TRABALHO_FEITO}') as ultimo_aviso`,
    [org.orgId, conv.id, conv.contact_id],
  );
  const agora = new Date();
  const decisao = podeAvisar(agora, rows[0]?.ultima_dela ?? null, rows[0]?.ultimo_aviso ?? null);
  if (!decisao.ok) return fail("conflict", t(MENSAGEM_DA_RECUSA[decisao.motivo]), 409, { requestId, details: { motivo: decisao.motivo } });

  const fronteira = await readCurrentServiceBoundary(pool, org.orgId, conv.id);
  if (fronteira === null) return fail("conflict", t("Esta conversa não está em atendimento agora."), 409, { requestId });

  await enqueueJob(pool, org.orgId, {
    leadId: conv.contact_id,
    kind: "followup_turn",
    maxAttempts: 2,
    payload: {
      reason: motivoDoTrabalhoFeito(lido.data.observacao),
      conversation_id: conv.id,
      so_dentro_da_janela: true,
      service_boundary: {
        organization_id: fronteira.organization_id,
        contact_id: fronteira.contact_id,
        conversation_id: fronteira.conversation_id,
        service_revision: fronteira.service_revision,
        demanda_id: fronteira.demanda_id,
        demanda_revision: fronteira.demanda_revision,
      },
      [CHAVE_DO_TRABALHO_FEITO]: { por: user.id },
    },
  });

  await audit({
    action: "service.work_done_confirmed",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "conversation",
    resourceId: conv.id,
    requestId,
    // A observação pode ter dado da cliente: fica no job, não na auditoria.
    metadata: { com_observacao: lido.data.observacao !== "" },
  });
  return ok({ avisando: true }, { requestId });
}
