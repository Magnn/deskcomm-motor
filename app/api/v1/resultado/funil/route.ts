/**
 * GET /api/v1/resultado/funil?period=… (manager+) — o funil das conversas que
 * começaram no período e onde as que não compraram pararam.
 * Mesmo recorte de período do dashboard (`lib/resultado/periodo.ts`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { lerConversasParaFunil, montarFunil } from "@/lib/resultado/funil-da-conversa";
import { calcularIntervalo, lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("manager", { requestId, resource: "reports" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const period = new URL(req.url).searchParams.get("period") ?? "7d";
  try {
    const admin = createAdminClient();
    const { start, end } = calcularIntervalo(period, new Date(), await lerFusoDaOrganizacao(admin, auth.org.orgId));
    const { conversas, cortado } = await lerConversasParaFunil(admin, auth.org.orgId, { inicio: start, fim: end });
    return ok({ funil: montarFunil(conversas), cortado }, { requestId });
  } catch (err) {
    logger.error("[resultado.funil] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível montar o funil da conversa."), 500, { requestId });
  }
}
