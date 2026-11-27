/**
 * /api/v1/cron/relatorio-da-meta — toda manhã, um aviso na Central de cada organização com meta de
 * receita (`organizations.settings.metas`): ontem contra a meta, o ritmo do mês, da semana e do
 * trimestre, o que falta por dia e o funil do mês. Ver `lib/venda/relatorio-da-meta.ts`.
 *
 * Um por organização por dia: se já existe o aviso das últimas 20 h, não abre outro — o agendador pode
 * repetir a chamada sem duplicar. Audita só quando abriu aviso.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerPainelDeEscala } from "@/lib/venda/painel-de-escala";
import { TITULO_DO_RELATORIO, textoDoRelatorioDoDia } from "@/lib/venda/relatorio-da-meta";

export const dynamic = "force-dynamic";

const reais = (centavos: number) => (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const admin = createAdminClient();
  const pool = getRequestPool();
  const agora = new Date();
  let abertos = 0;
  try {
    const { rows: orgs } = await pool.query<{ id: string }>(
      `select id from organizations where (settings->'metas'->>'receita_mensal_cents') is not null`,
    );
    for (const { id: org } of orgs) {
      const { data: existente } = await admin
        .from("agent_inbox_items")
        .select("id")
        .eq("organization_id", org)
        .eq("kind", "other")
        .like("title", `${TITULO_DO_RELATORIO} — %`)
        .gte("created_at", new Date(agora.getTime() - 20 * 3_600_000).toISOString())
        .limit(1);
      if ((existente ?? []).length > 0) continue;

      // O relatório leva receita e contatos; o gasto com anúncio fica no painel, para quem pode ver.
      const painel = await lerPainelDeEscala(admin, pool, org, { agora, podeVerGasto: false });
      const texto = textoDoRelatorioDoDia(painel, reais);
      if (!texto) continue;
      const { error } = await admin.from("agent_inbox_items").insert({
        organization_id: org,
        kind: "other",
        severity: texto.severidade,
        title: texto.titulo,
        body: texto.corpo,
        ref_kind: null,
        ref_id: null,
      });
      if (error) throw new Error(`abrir aviso: ${error.message}`);
      abertos += 1;
    }
  } catch (err) {
    logger.error("[cron.relatorio-da-meta] rodada falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "relatório da meta falhou", 500, { requestId });
  }

  if (abertos > 0) {
    void audit({ action: "cron.relatorio_da_meta", requestId, bypassedRls: true, metadata: { avisos: abertos } });
  }
  return ok({ avisos: abertos }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
