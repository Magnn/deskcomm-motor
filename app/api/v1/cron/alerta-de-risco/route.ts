/**
 * GET/POST /api/v1/cron/alerta-de-risco — avisa fora da tela quem administra
 * quando uma conversa passada por risco de vida segue sem ninguém.
 *
 * A regra mora em `lib/escalacao/alerta-de-risco.ts`. De 5 em 5 minutos, porque é
 * o menor atraso aceitável aqui e a varredura só lê passagens não reconhecidas.
 *
 * Auth: Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET, fail-closed. Audita SÓ
 * quando alertou: varredura vazia não é mutação.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { rodarAlertasDeRisco } from "@/lib/escalacao/alerta-de-risco";
import { criarDepsDoAlerta } from "@/lib/escalacao/alerta-de-risco.producao";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const resultado = await rodarAlertasDeRisco(criarDepsDoAlerta(createAdminClient()));

  if (resultado.alertadas > 0) {
    await audit({
      action: "ai.alerta_de_risco_enviado",
      resourceType: "conversation",
      requestId,
      metadata: { ...resultado },
    });
  }
  return ok(resultado);
}

export const GET = handle;
export const POST = handle;
