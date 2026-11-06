/**
 * A RENOVAÇÃO DO PLANO DA SEMANA no cartão guardado (migration 0954). De hora em hora: avisa por e-mail quem vence
 * nas próximas 48 horas (0958), cobra quem vence nas próximas 12 horas e já foi avisado há 24 h, e tenta de novo,
 * depois de 24 h, quem teve o cartão recusado (3 recusas desligam).
 *
 * Regra e cobrança em `lib/area-do-cliente/plano-semanal-renovacao.ts`. Quem estende o plano é o aviso de
 * pagamento da Stripe, não esta rota.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { avisarRenovacoes, renovarPlanosSemanais } from "@/lib/area-do-cliente/plano-semanal-renovacao";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }
  let rodada;
  try {
    const admin = createAdminClient();
    const agora = new Date();
    const avisos = await avisarRenovacoes(admin, agora);
    rodada = { ...(await renovarPlanosSemanais(admin, agora)), ...avisos };
  } catch (err) {
    logger.error("[area-planos] rodada falhou", { error: err instanceof Error ? err.message : String(err), requestId });
    return fail("internal_error", "Falha na rodada de renovação.", 500, { requestId });
  }
  // Rodada que não avisou, não cobrou nem marcou recusa NÃO é mutação e não audita (CLAUDE.md §Audit log).
  if (rodada.avisados > 0 || rodada.cobradas > 0 || rodada.recusadas > 0) {
    await audit({ action: "area.planos_renovados", resourceType: "area_planos", metadata: { ...rodada }, requestId });
  }
  return ok(rodada, { requestId });
}

export const GET = handle;
export const POST = handle;
