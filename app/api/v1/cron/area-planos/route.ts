/**
 * A RENOVAÇÃO DO PLANO DA SEMANA no cartão guardado (migration 0954). De hora em hora: cobra quem vence nas
 * próximas 12 horas e tenta de novo, depois de 24 h, quem teve o cartão recusado (3 recusas desligam).
 *
 * Regra e cobrança em `lib/area-do-cliente/plano-semanal-renovacao.ts`. Quem estende o plano é o aviso de
 * pagamento da Stripe, não esta rota.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { renovarPlanosSemanais } from "@/lib/area-do-cliente/plano-semanal-renovacao";
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
    rodada = await renovarPlanosSemanais(createAdminClient(), new Date());
  } catch (err) {
    logger.error("[area-planos] rodada falhou", { error: err instanceof Error ? err.message : String(err), requestId });
    return fail("internal_error", "Falha na rodada de renovação.", 500, { requestId });
  }
  // Rodada que não cobrou nem marcou recusa NÃO é mutação e não audita (CLAUDE.md §Audit log).
  if (rodada.cobradas > 0 || rodada.recusadas > 0) {
    await audit({ action: "area.planos_renovados", resourceType: "area_planos", metadata: { ...rodada }, requestId });
  }
  return ok(rodada, { requestId });
}

export const GET = handle;
export const POST = handle;
