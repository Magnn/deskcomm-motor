/**
 * GET/POST /api/v1/cron/meta-tokens — renova o token de 60 dias dos números oficiais.
 *
 * Número conectado pela configuração de 60 dias (a única que a Meta oferece a
 * app que ainda não é Provedor de Tecnologia) para de enviar e de receber no dia
 * em que o token vence, sem ninguém ter mexido em nada. Esta rodada troca por
 * outro de 60 dias o token de quem vence nos próximos 20 dias
 * (`renovarTokenDoNumero`), e grava a nova data (migration 0931).
 *
 * Renovação recusada NÃO derruba o canal: o token atual segue valendo até a
 * data dele, e a rodada do dia seguinte tenta de novo — são 20 tentativas antes
 * do vencimento. O motivo vai ao log e à trilha.
 *
 * Irmão de `cron/instagram-tokens`. Audita só quando houve efeito.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { CHANNEL_PROVIDER_META } from "@/lib/channels/capabilities";
import { appDaMeta, credencialDoAppDoNumero } from "@/lib/channels/meta/app";
import { renovarTokenDoNumero } from "@/lib/channels/meta/cadastro-incorporado";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";

export const ANTECEDENCIA_MS = 20 * 24 * 60 * 60 * 1000;
const NUMEROS_POR_RODADA = 50;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  const { appId, appSecret } = await appDaMeta();
  if (!appId || !appSecret) return ok({ renovados: 0, falhas: 0, motivo: "app_da_meta_nao_configurado" }, { requestId });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("channel_sessions")
    .select("id, organization_id, meta_token_encrypted, meta_token_expires_at, meta_app_id")
    .eq("provider", CHANNEL_PROVIDER_META)
    .is("archived_at", null)
    .not("meta_token_encrypted", "is", null)
    .lte("meta_token_expires_at", new Date(Date.now() + ANTECEDENCIA_MS).toISOString())
    .order("meta_token_expires_at", { ascending: true })
    .limit(NUMEROS_POR_RODADA);
  if (error) {
    logger.error("[cron.meta-tokens] leitura falhou", { requestId, erro: error.message });
    return fail("internal_error", "leitura dos canais falhou", 500, { requestId });
  }

  let renovados = 0;
  let falhas = 0;
  type Linha = { id: string; organization_id: string; meta_token_encrypted: string; meta_token_expires_at: string; meta_app_id: string | null };
  for (const c of (data ?? []) as Linha[]) {
    try {
      const atual = await decryptWebhookSecret(admin, c.meta_token_encrypted);
      if (!atual) throw new Error("token ilegível");
      // O token só renova com a chave do app que o emitiu (0933): depois de uma troca
      // de app, o número antigo segue com a chave guardada do app dele.
      const app = await credencialDoAppDoNumero(c.meta_app_id);
      if (!app) throw new Error(`app ${c.meta_app_id ?? "da instalação"} sem chave conhecida`);
      const novo = await renovarTokenDoNumero({ appId: app.appId, appSecret: app.appSecret, token: atual });
      if (!novo.ok) throw new Error(novo.motivo);
      const cifrado = await encryptWebhookSecret(admin, novo.token);
      if (!cifrado) throw new Error("cifra indisponível");
      const { error: erroDaGravacao } = await admin
        .from("channel_sessions")
        .update({ meta_token_encrypted: cifrado, meta_token_expires_at: novo.expiraEm?.toISOString() ?? null })
        .eq("id", c.id)
        .eq("organization_id", c.organization_id);
      if (erroDaGravacao) throw new Error(erroDaGravacao.message);
      renovados++;
    } catch (err) {
      falhas++;
      logger.warn("[cron.meta-tokens] token não foi renovado", {
        requestId,
        canal: c.id,
        vence: c.meta_token_expires_at,
        erro: err instanceof Error ? err.message.slice(0, 300) : String(err),
      });
    }
  }

  if (renovados > 0 || falhas > 0) {
    void audit({ action: "cron.meta_tokens", requestId, bypassedRls: true, metadata: { renovados, falhas } });
  }
  return ok({ renovados, falhas }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
