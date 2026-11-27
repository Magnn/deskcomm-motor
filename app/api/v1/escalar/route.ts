/**
 * GET /api/v1/escalar — o painel "Escalar" (manager+): a meta de receita em cascata e o ritmo, o funil
 * do mês, as faixas de valor, a recompra, os números e o gasto com anúncio. Ver `lib/venda/painel-de-escala.ts`.
 */
import { randomUUID } from "node:crypto";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerPainelDeEscala } from "@/lib/venda/painel-de-escala";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "dashboard_settings" });
  if (!authz.ok) return authz.response;
  try {
    const painel = await lerPainelDeEscala(createAdminClient(), getRequestPool(), authz.org.orgId, { podeVerGasto: true });
    return ok(painel, { requestId });
  } catch (err) {
    logger.error("[escalar] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "Não foi possível ler o painel.", 500, { requestId });
  }
}
