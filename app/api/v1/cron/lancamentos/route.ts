/**
 * GET/POST /api/v1/cron/lancamentos — uma rodada dos lançamentos em grupos.
 *
 * Duas tarefas, nesta ordem:
 *
 *   1. DISPAROS vencidos saem para os grupos (`lib/lancamentos/disparo.ts`), com
 *      pausa entre grupos e orçamento de tempo — o que não couber fica para a
 *      rodada seguinte, sem repetir grupo.
 *   2. MANUTENÇÃO dos lançamentos ativos: relê a contagem de cada grupo e abre o
 *      próximo quando as vagas estão no fim. É a rede de segurança do link público.
 *
 * Audita só quando houve efeito — mesmo critério de `campaign-worker`, e o que
 * `tests/unit/cron-audita-so-quando-ha-efeito.test.ts` varre.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { ORCAMENTO_DA_RODADA_MS, rodarDisparosVencidos } from "@/lib/lancamentos/disparo";
import { urlAssinadaDaMidia } from "@/lib/lancamentos/midia";
import { manterLancamento, type Lancamento } from "@/lib/lancamentos/servico";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { transporteDeGrupos } from "@/lib/channels/grupos";

export const dynamic = "force-dynamic";

/** Quantos lançamentos a manutenção olha por rodada — os que estão há mais tempo sem olhar vêm primeiro. */
const LANCAMENTOS_POR_RODADA = 20;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const transporte = transporteDeGrupos();
  if (!transporte) return ok({ disparos: 0, enviados: 0, falhas: 0, concluidos: 0, grupos_abertos: 0, motivo: "grupos_indisponiveis" }, { requestId });

  const admin = createAdminClient();
  const inicio = Date.now();

  const r = await rodarDisparosVencidos({
    admin,
    whatsapp: transporte,
    urlDaMidia: (caminho) => urlAssinadaDaMidia(admin, caminho),
    agora: () => new Date(),
    dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });

  let gruposAbertos = 0;
  const { data, error } = await admin
    .from("group_launches")
    .select("id, organization_id, channel_session_id, name, slug, group_name_template, group_description, group_capacity, admins_only, seed_participant, status, created_at")
    .eq("status", "active")
    .order("updated_at", { ascending: true })
    .limit(LANCAMENTOS_POR_RODADA);
  if (error) logger.error("[cron.lancamentos] leitura dos lançamentos falhou", { requestId, erro: error.message });
  for (const lancamento of (data ?? []) as Lancamento[]) {
    if (Date.now() - inicio > ORCAMENTO_DA_RODADA_MS) break;
    try {
      const m = await manterLancamento(admin, transporte, lancamento);
      if (m.abriu) gruposAbertos++;
    } catch (err) {
      logger.warn("[cron.lancamentos] manutenção de um lançamento falhou", { requestId, lancamento: lancamento.id, erro: String(err) });
    }
  }

  if (r.enviados > 0 || r.falhas > 0 || r.concluidos > 0 || gruposAbertos > 0) {
    void audit({
      action: "cron.lancamentos",
      requestId,
      bypassedRls: true,
      metadata: { disparos: r.disparos, enviados: r.enviados, falhas: r.falhas, concluidos: r.concluidos, grupos_abertos: gruposAbertos },
    });
  }
  return ok({ ...r, grupos_abertos: gruposAbertos }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
