/**
 * /api/v1/resultado/perdas (manager+) — o motivo da perda das conversas paradas.
 *
 *   GET  ?period=… → os motivos do período, a confiança média da inferência e
 *                    quantas conversas ainda esperam análise.
 *   POST           → analisa um lote: "oferta → silêncio" vira motivo por REGRA
 *                    (sem custo); as demais passam pela IA, com o teto de gasto
 *                    de sempre. Disparada por uma pessoa — nenhum gasto de IA
 *                    acontece sozinho.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { logger } from "@/lib/logger";
import { analisarPendentes, lerPainelDePerdas } from "@/lib/resultado/motivo-da-perda";
import { depsReaisDaAnalise } from "@/lib/resultado/motivo-da-perda-ia";
import { calcularIntervalo } from "@/lib/resultado/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const period = new URL(req.url).searchParams.get("period") ?? "7d";
  const { start, end } = calcularIntervalo(period, new Date());
  try {
    return ok(await lerPainelDePerdas(createAdminClient(), auth.org.orgId, { inicio: start, fim: end }, new Date()), { requestId });
  } catch (err) {
    logger.error("[resultado.perdas] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível ler os motivos de perda."), 500, { requestId });
  }
}

export async function POST(): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  let pool;
  try {
    pool = getRequestPool();
  } catch {
    return fail("ia_indisponivel", t("A inteligência artificial não está disponível nesta instalação."), 503, { requestId });
  }

  try {
    const r = await analisarPendentes(
      createAdminClient(),
      depsReaisDaAnalise(pool, llmEdgeConfigFromEnv(env), auth.org.orgId),
      auth.org.orgId,
      new Date(),
    );
    if (r.porRegra + r.porIa > 0) {
      void audit({
        action: "resultado.perdas_analisadas",
        actorUserId: auth.user.id,
        organizationId: auth.org.orgId,
        resourceType: "conversation_loss_reason",
        resourceId: null,
        requestId,
        metadata: { por_regra: r.porRegra, por_ia: r.porIa, sem_leitura: r.semLeitura, interrompida: r.interrompida !== null },
      });
    }
    return ok(r, { requestId });
  } catch (err) {
    logger.error("[resultado.perdas] análise falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível analisar as conversas."), 500, { requestId });
  }
}
