/**
 * A RECUPERAÇÃO DE QUEM VIU A PRÉVIA DO QUIZ E NÃO PAGOU (migration 0960). De 15 em 15 minutos: o 1º e-mail 1 h
 * depois da visita, o 2º 23 h depois do 1º, com o link que reabre a prévia já calculada.
 *
 * Regra em `lib/area-do-cliente/recuperacao-do-quiz.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { recuperarQuizzes } from "@/lib/area-do-cliente/recuperacao-do-quiz";
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
    rodada = await recuperarQuizzes(createAdminClient(), new Date());
  } catch (err) {
    logger.error("[area-quiz-recupera] rodada falhou", { error: err instanceof Error ? err.message : String(err), requestId });
    return fail("internal_error", "Falha na rodada de recuperação.", 500, { requestId });
  }
  // Rodada que não mandou nada NÃO é mutação e não audita (CLAUDE.md §Audit log).
  if (rodada.enviados > 0) {
    await audit({ action: "area.quiz_recuperado", resourceType: "area_quiz_visitas", metadata: { ...rodada }, requestId });
  }
  return ok(rodada, { requestId });
}

export const GET = handle;
export const POST = handle;
