/**
 * GET/POST /api/v1/cron/instagram-tokens — estica o token das contas do Instagram.
 *
 * O token de uma conta vale 60 dias. Sem renovar, a regra de "comentou, recebe
 * direct" para de responder num dia qualquer, dois meses depois de conectada, sem
 * ninguém ter mexido em nada. Esta rodada renova quem vence nos próximos 15 dias.
 *
 * Token que a Meta se recusa a renovar (conta que revogou o acesso, senha
 * trocada) marca a conexão como `error`, com o motivo: a tela passa a pedir para
 * reconectar em vez de parecer conectada e muda.
 *
 * Audita só quando houve efeito.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { renovarToken } from "@/lib/channels/instagram/api";
import { appDoInstagram } from "@/lib/channels/instagram/app";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

const ANTECEDENCIA_MS = 15 * 24 * 60 * 60 * 1000;
const CONTAS_POR_RODADA = 50;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  if (!appDoInstagram()) return ok({ renovadas: 0, falhas: 0, motivo: "instagram_nao_configurado" }, { requestId });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("instagram_connections")
    .select("id, organization_id, access_token_encrypted")
    .eq("status", "active")
    .lte("token_expires_at", new Date(Date.now() + ANTECEDENCIA_MS).toISOString())
    .order("token_expires_at", { ascending: true })
    .limit(CONTAS_POR_RODADA);
  if (error) {
    logger.error("[cron.instagram-tokens] leitura falhou", { requestId, erro: error.message });
    return fail("internal_error", "leitura das conexões falhou", 500, { requestId });
  }

  let renovadas = 0;
  let falhas = 0;
  for (const c of (data ?? []) as Array<{ id: string; organization_id: string; access_token_encrypted: string }>) {
    try {
      const atual = await decryptWebhookSecret(admin, c.access_token_encrypted);
      if (!atual) throw new Error("token ilegível");
      const novo = await renovarToken(atual);
      const cifrado = await encryptWebhookSecret(admin, novo.token);
      if (!cifrado) throw new Error("cifra indisponível");
      const { error: erroDaGravacao } = await admin
        .from("instagram_connections")
        .update({ access_token_encrypted: cifrado, token_expires_at: novo.expiraEm?.toISOString() ?? null })
        .eq("id", c.id);
      if (erroDaGravacao) throw new Error(erroDaGravacao.message);
      renovadas++;
    } catch (err) {
      falhas++;
      const motivo = err instanceof Error ? err.message.slice(0, 300) : String(err);
      await admin.from("instagram_connections").update({ status: "error", status_reason: motivo }).eq("id", c.id);
      logger.warn("[cron.instagram-tokens] token não foi renovado", { requestId, conexao: c.id, erro: motivo });
    }
  }

  if (renovadas > 0 || falhas > 0) {
    void audit({ action: "cron.instagram_tokens", requestId, bypassedRls: true, metadata: { renovadas, falhas } });
  }
  return ok({ renovadas, falhas }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
