/**
 * GET /api/v1/area/quizzes/leads?dias=30 (viewer+) — os leads dos quizzes da página: quem deu o e-mail ou pediu o
 * pagamento, com até onde chegou, campanha e região. Regra em `lib/area-do-cliente/leads-dos-quizzes.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerLeadsDosQuizzes } from "@/lib/area-do-cliente/leads-dos-quizzes";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const dias = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 30));
  try {
    const r = await lerLeadsDosQuizzes(await createClient(), authz.org.orgId, new Date(Date.now() - dias * 86_400_000));
    return ok({ dias, ...r }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "falha ao ler os leads dos quizzes", 500, { requestId });
  }
}
