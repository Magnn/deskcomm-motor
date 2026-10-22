/**
 * GET /api/v1/area/quizzes/ao-vivo?dias=1 (viewer+) — o painel ao vivo dos quizzes da página (migration 0944):
 * quem está na página agora e em que passo, quem parou no pagamento (com nome e e-mail), de onde vêm, a que
 * horas abrem e quanto tempo levam até a prévia. Regra em `lib/area-do-cliente/ao-vivo-dos-quizzes.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { lerAoVivo } from "@/lib/area-do-cliente/ao-vivo-dos-quizzes";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "area_do_cliente" });
  if (!authz.ok) return authz.response;
  const dias = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get("dias")) || 1));
  try {
    const db = await createClient();
    const { data: org } = await db.from("organizations").select("timezone").eq("id", authz.org.orgId).maybeSingle();
    const fuso = (org as { timezone: string | null } | null)?.timezone || "America/Sao_Paulo";
    const vivo = await lerAoVivo(db, authz.org.orgId, new Date(Date.now() - dias * 86_400_000), fuso);
    return ok({ dias, fuso, ...vivo }, { requestId });
  } catch (err) {
    return fail("internal_error", err instanceof Error ? err.message : "falha ao ler o painel ao vivo", 500, { requestId });
  }
}
