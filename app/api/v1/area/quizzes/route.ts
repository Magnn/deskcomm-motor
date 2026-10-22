/**
 * GET /api/v1/area/quizzes?dias=7 (viewer+) — o funil dos quizzes da página, medido no nosso banco (migration
 * 0944): quantas pessoas chegaram a cada passo, onde mais gente para, e o resultado por campanha. Regra em
 * `lib/area-do-cliente/funil-dos-quizzes.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerFunilDosQuizzes } from "@/lib/area-do-cliente/funil-dos-quizzes";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const dias = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 7));
  try {
    const funil = await lerFunilDosQuizzes(await createClient(), authz.org.orgId, new Date(Date.now() - dias * 86_400_000));
    return ok({ dias, ...funil }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "falha ao ler o funil dos quizzes", 500, { requestId });
  }
}
