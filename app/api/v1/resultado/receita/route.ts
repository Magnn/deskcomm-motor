/**
 * GET /api/v1/resultado/receita?period=… (manager+) — a receita atribuída do
 * período, e a do período anterior para comparar.
 *
 * Receita é dado sensível do negócio: quem atende (agent) não vê. O recorte de
 * período é o MESMO do dashboard (`lib/resultado/periodo.ts`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { calcularDelta, calcularIntervalo, lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { atribuirReceita, lerDadosParaAtribuir } from "@/lib/resultado/receita-atribuida";
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
    const { start, end, prevStart, prevEnd } = calcularIntervalo(period, new Date(), await lerFusoDaOrganizacao(admin, auth.org.orgId));
    const [atual, anterior] = await Promise.all([
      lerDadosParaAtribuir(admin, auth.org.orgId, { inicio: start, fim: end }),
      lerDadosParaAtribuir(admin, auth.org.orgId, { inicio: prevStart, fim: prevEnd }),
    ]);
    const receita = atribuirReceita(atual);
    const antes = atribuirReceita(anterior);
    return ok(
      {
        periodo: { inicio: start.toISOString(), fim: end.toISOString() },
        receita,
        anterior: { receitaLiquidaCentavos: antes.receitaLiquidaCentavos, vendas: antes.vendas },
        delta: {
          receita: calcularDelta(receita.receitaLiquidaCentavos, antes.receitaLiquidaCentavos),
          vendas: calcularDelta(receita.vendas, antes.vendas),
        },
        cortado: atual.cortado,
      },
      { requestId },
    );
  } catch (err) {
    logger.error("[resultado.receita] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível calcular a receita."), 500, { requestId });
  }
}
