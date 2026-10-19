/**
 * O AVISO DIÁRIO DA ÁREA DO CLIENTE — "a sua carta de hoje abriu" na tela do celular de quem pediu.
 *
 * De hora em hora, como o aniversário (`contact-birthdays`), porque quem decide o momento é o relógio de
 * parede de CADA empresa: a rodada só age naquela cujo fuso marca a hora do aviso (`area.avisos.hora`).
 * No máximo um aviso por dia por aparelho (`area_avisos.ultimo_aviso_dia`, marcado antes de mandar).
 *
 * Regra e envio em `lib/area-do-cliente/avisos-servidor.ts`.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { enviarAvisosDoDia } from "@/lib/area-do-cliente/avisos-servidor";
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
    rodada = await enviarAvisosDoDia(createAdminClient(), new Date());
  } catch (err) {
    logger.error("[area-avisos] rodada falhou", { error: err instanceof Error ? err.message : String(err), requestId });
    return fail("internal_error", "Falha na rodada dos avisos.", 500, { requestId });
  }
  // Rodada que não mandou nada NÃO é mutação e não audita (CLAUDE.md §Audit log).
  if (rodada.enviados > 0 || rodada.removidos > 0) {
    await audit({ action: "area.avisos_enviados", resourceType: "area_avisos", metadata: { ...rodada }, requestId });
  }
  return ok(rodada, { requestId });
}

export const GET = handle;
export const POST = handle;
