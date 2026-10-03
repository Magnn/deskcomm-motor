/**
 * /api/v1/cron/marcos-da-conversa — classifica as mensagens novas em marcos da
 * conversa (oferta apresentada, objeção). Ver `lib/resultado/marcos.ts`.
 *
 * Roda a cada poucos minutos e drena até `RODADAS_POR_CHAMADA` lotes: o primeiro
 * disparo depois da instalação encontra o histórico inteiro pela frente, e uma
 * rodada só por chamada levaria horas para alcançar o presente.
 *
 * A auditoria só é gravada quando HOUVE marco novo — uma linha por execução
 * ociosa seriam milhares de linhas por mês dizendo "nada aconteceu".
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { logger } from "@/lib/logger";
import { classificarNovasMensagens } from "@/lib/resultado/marcos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const RODADAS_POR_CHAMADA = 10;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });

  const admin = createAdminClient();
  let lidas = 0;
  let marcos = 0;
  let haMais = false;
  try {
    for (let i = 0; i < RODADAS_POR_CHAMADA; i += 1) {
      const r = await classificarNovasMensagens(admin);
      lidas += r.lidas;
      marcos += r.marcos;
      haMais = r.haMais;
      if (!r.haMais) break;
    }
  } catch (err) {
    logger.error("[cron.marcos-da-conversa] rodada falhou", { requestId, erro: err instanceof Error ? err.message : String(err) });
    return fail("internal_error", "classificação das mensagens falhou", 500, { requestId });
  }

  if (marcos > 0) {
    void audit({ action: "cron.marcos_da_conversa", requestId, bypassedRls: true, metadata: { lidas, marcos, ha_mais: haMais } });
  }
  return ok({ lidas, marcos, ha_mais: haMais }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
