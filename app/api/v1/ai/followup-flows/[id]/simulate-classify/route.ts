import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/ai/followup-flows/:id/simulate-classify (manager+)
 *
 * A ÚNICA parte do Simulador do construtor de fluxo que chama uma IA de
 * verdade — classificar uma mensagem não tem efeito colateral externo (não
 * envia WhatsApp, não persiste `followup_enrollments`/`contact`), então é o
 * único jeito de provar de verdade que um nó `ai_classify` roteia como o
 * dono do fluxo espera. Todo o resto do simulador (o roteamento do grafo em
 * si, e o texto que um `action`/`skill` SERIA enviado) é resolvido em
 * memória, no navegador, pelo driver puro `lib/followup/simulate.ts` — esta
 * rota nunca é chamada para eles.
 *
 * Reusa o MESMO ponto de classificação da produção
 * (`classifyFollowupReply`, lib/agent-engine/agent/followup-flow-classify.ts
 * — o classificador real do motor de follow-up), sem criar enrollment, sem
 * `leadId` real (`null` — o campo é opcional em `llm_calls`) e sem tocar
 * `followup_enrollments`/`followup_enrollment_events`. É "dry-run" no MESMO
 * sentido do `POST .../versions/:vid/test` do agente de IA: roda o motor de
 * verdade, mas não deixa rastro de negócio — só o custo/latência do provider,
 * que é esperado (mesmo aviso "consome créditos" do TestPanel do agente).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyFollowupReply } from "@/lib/agent-engine/agent/followup-flow-classify";
import { requestTurnDeps } from "@/lib/agent-engine/agent/request-deps";
import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteCtx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  candidate_text: z.string().min(1).max(4000),
  classes: z.array(z.string().min(1).max(40)).min(1).max(8),
  hint: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  if (!UUID_RX.test(id)) {
    return fail("invalid_request", "id inválido.", 400, { requestId });
  }

  const authz = await requireRole("manager", { requestId, resource: "followup_flows" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { user, org: activeOrg } = authz;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail("invalid_request", t("Body JSON inválido."), 400, { requestId });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", t("Campos inválidos."), 422, {
      requestId,
      details: parsed.error.flatten(),
    });
  }

  const admin = createAdminClient();
  const { data: pointer, error: fetchErr } = await admin
    .from("followup_flow_pointers")
    .select("id")
    .eq("id", id)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!pointer) return fail("not_found", t("Fluxo não encontrado."), 404, { requestId });

  const deps = requestTurnDeps();
  let classe: string;
  try {
    classe = await classifyFollowupReply(
      getRequestPool(),
      deps.llmCfg,
      { tenantId: activeOrg.orgId, leadId: null, jobId: randomUUID() },
      {
        candidateText: parsed.data.candidate_text,
        classes: parsed.data.classes,
        ...(parsed.data.hint !== undefined ? { hint: parsed.data.hint } : {}),
      },
      { registry: deps.registry, log: deps.log },
    );
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    logger.error("[followup.simulate-classify] classificação falhou", {
      request_id: requestId,
      pointer_id: id,
      organization_id: activeOrg.orgId,
      error: mensagem,
    });
    return fail(
      "simulate_classify_failed",
      t("Não foi possível classificar essa mensagem. Confira modelo e credencial de IA."),
      422,
      { requestId },
    );
  }

  void audit({
    action: "followup_flow.simulated",
    actorUserId: user.id,
    organizationId: activeOrg.orgId,
    resourceType: "followup_flow_pointer",
    resourceId: id,
    requestId,
    metadata: { dry_run: true, node_kind: "ai_classify" },
  });

  return ok({ class: classe }, { requestId });
}
