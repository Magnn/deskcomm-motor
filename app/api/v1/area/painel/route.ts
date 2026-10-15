/**
 * GET /api/v1/area/painel?dias=30 (viewer+) — o funil da área do cliente:
 * convidados → entraram → voltaram → viram serviços → clicaram em comprar →
 * compraram; o desempenho de cada serviço; onde as pessoas param; o que elas
 * abrem; e o que dizem que gostariam de receber. Regra em
 * `lib/area-do-cliente/metricas.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerPainel } from "@/lib/area-do-cliente/metricas";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const dias = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 30));
  try {
    const painel = await lerPainel(await createClient(), authz.org.orgId, new Date(Date.now() - dias * 86_400_000));
    return ok({ dias, ...painel }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "falha ao ler o painel", 500, { requestId });
  }
}
