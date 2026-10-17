/**
 * /api/v1/cron/resumo-pos-venda — toda segunda de manhã, um aviso na Central de cada organização com
 * catálogo ligado: o pós-venda dos últimos 7 dias (ofertas, links, compras e receita por produto),
 * comparado com a semana anterior, e a receita média por cliente. Ver `lib/resultado/pos-venda.ts`.
 *
 * Um por organização por semana: se já existe o aviso aberto dos últimos 6 dias, não abre outro —
 * o agendador pode repetir a chamada sem duplicar. Audita só quando abriu aviso.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { lerPainelDoPosVenda, textoDoResumoSemanal } from "@/lib/resultado/pos-venda";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SEMANA_MS = 7 * 24 * 3_600_000;
const TITULO = "Pós-venda da semana";

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const admin = createAdminClient();
  const pool = getRequestPool();
  const agora = new Date();
  let abertos = 0;
  try {
    // Só quem tem agente com catálogo: o painel devolve `null` para quem não tem, e a lista fica curta.
    const { rows: orgs } = await pool.query<{ organization_id: string }>(
      `select distinct organization_id from ai_agents
        where archived_at is null and (config->'catalog'->>'enabled')::boolean is true`,
    );
    for (const { organization_id: org } of orgs) {
      const { data: existente } = await admin
        .from("agent_inbox_items")
        .select("id")
        .eq("organization_id", org)
        .eq("kind", "other")
        .eq("title", TITULO)
        .gte("created_at", new Date(agora.getTime() - 6 * 24 * 3_600_000).toISOString())
        .limit(1);
      if ((existente ?? []).length > 0) continue;

      const fuso = await lerFusoDaOrganizacao(admin, org);
      const semana = await lerPainelDoPosVenda(pool, org, { inicio: new Date(agora.getTime() - SEMANA_MS), fim: agora }, fuso);
      if (semana === null) continue;
      const anterior = await lerPainelDoPosVenda(
        pool,
        org,
        { inicio: new Date(agora.getTime() - 2 * SEMANA_MS), fim: new Date(agora.getTime() - SEMANA_MS) },
        fuso,
      );
      const { titulo, corpo } = textoDoResumoSemanal(semana, anterior, reais);
      const { error } = await admin.from("agent_inbox_items").insert({
        organization_id: org,
        kind: "other",
        severity: semana.ofertasRepetidasNoDia > 0 ? "warn" : "info",
        title: titulo,
        body: corpo,
        ref_kind: null,
        ref_id: null,
      });
      if (error) throw new Error(`abrir aviso: ${error.message}`);
      abertos += 1;
    }
  } catch (err) {
    logger.error("[cron.resumo-pos-venda] rodada falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "resumo do pós-venda falhou", 500, { requestId });
  }

  if (abertos > 0) {
    void audit({ action: "cron.resumo_pos_venda", requestId, bypassedRls: true, metadata: { avisos: abertos } });
  }
  return ok({ avisos: abertos }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
