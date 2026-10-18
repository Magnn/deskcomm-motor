/**
 * GET /api/v1/resultado/retorno-da-plataforma?period=… (manager+) — o que a plataforma trouxe no período: o
 * trabalho do agente, as vendas pagas e quanto a empresa pagou à plataforma por isso
 * (`lib/resultado/retorno-da-plataforma.ts`).
 *
 * Mesmo recorte de período do dashboard e mesma regra de quem vê da aba Receita: é dinheiro do negócio.
 * O plano entra no custo só quando é PAGO (origem Stripe ou Cakto); o plano dado à mão por quem administra a
 * instalação (`manual`) não custou nada à empresa e não pode inflar o custo.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { logger } from "@/lib/logger";
import { lerAssinatura, planosDaInstalacao } from "@/lib/planos/assinatura-da-organizacao";
import { planoPorId } from "@/lib/planos/catalogo";
import { calcularIntervalo, lerFusoDaOrganizacao } from "@/lib/resultado/periodo";
import { lerRetornoDaPlataforma } from "@/lib/resultado/retorno-da-plataforma";
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
    const fuso = await lerFusoDaOrganizacao(admin, auth.org.orgId);
    const { start, end } = calcularIntervalo(period, new Date(), fuso);
    const assinatura = await lerAssinatura(admin, auth.org.orgId);
    const paga = assinatura?.status === "ativa" && assinatura.origem !== "manual";
    const plano = paga ? planoPorId(planosDaInstalacao(), assinatura.planoId) : null;
    const retorno = await lerRetornoDaPlataforma(
      getRequestPool(),
      auth.org.orgId,
      { inicio: start, fim: end },
      plano ? { nome: plano.nome, precoMensalCentavos: plano.precoMensalCentavos } : null,
    );
    return ok({ periodo: { inicio: start.toISOString(), fim: end.toISOString() }, retorno }, { requestId });
  } catch (err) {
    logger.error("[resultado.retorno] leitura falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", t("Não foi possível calcular o que a plataforma trouxe."), 500, { requestId });
  }
}
