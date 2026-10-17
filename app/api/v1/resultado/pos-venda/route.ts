/**
 * GET /api/v1/resultado/pos-venda?period=… (manager+) — o que o catálogo do agente rendeu no período:
 * oferecido, link pedido, compras e receita por produto, e a receita média por cliente de sempre.
 *
 * Mesmo recorte de período do dashboard (`lib/resultado/periodo.ts`) e mesma regra de quem vê da aba
 * Receita: é dinheiro do negócio. `data: null` = a organização não tem catálogo ligado.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { calcularIntervalo, lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { lerPainelDoPosVenda } from "@/lib/resultado/pos-venda";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);
  const period = new URL(req.url).searchParams.get("period") ?? "7d";

  try {
    const fuso = await lerFusoDaOrganizacao(createAdminClient(), auth.org.orgId);
    const { start, end } = calcularIntervalo(period, new Date(), fuso);
    const painel = await lerPainelDoPosVenda(getRequestPool(), auth.org.orgId, { inicio: start, fim: end }, fuso);
    return ok({ periodo: { inicio: start.toISOString(), fim: end.toISOString() }, painel }, { requestId });
  } catch (err) {
    logger.error("[resultado.pos-venda] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível calcular o pós-venda."), 500, { requestId });
  }
}
