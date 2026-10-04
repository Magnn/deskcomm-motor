/**
 * GET /api/v1/plataformas-de-anuncio/meta/callback — a volta do login do Facebook.
 *
 * Chega SEM sessão (o cookie é `SameSite=Strict` e não viaja numa navegação
 * vinda de outro site): a organização e a pessoa vêm do `state` assinado, nunca
 * de um parâmetro que o navegador possa trocar.
 *
 *   código → token longo → contas que ele alcança → grava cifrado na MESMA linha
 *   de `ad_insights_connections` que o token colado usa → volta para
 *   Configurações › Meta Ads.
 *
 * Qualquer falha devolve a pessoa para a tela com `?erro=<motivo>`: é ela quem
 * precisa saber o que deu errado, e uma página de erro técnica não diz.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
// A troca do código é a do login do Facebook, igual para qualquer produto do app.
import { MessengerApiError, trocarCodigoPorTokenLongo } from "@/lib/channels/messenger/api";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { listarContas } from "@/lib/plataformas-de-anuncio/meta/insights";
import {
  appDoMetaAds,
  contaPadraoDepoisDeConectar,
  redirectDoMetaAds,
  verificarEstado,
} from "@/lib/plataformas-de-anuncio/meta/login";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptWebhookSecret } from "@/lib/webhooks/secrets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function voltar(parametros: Record<string, string>): Response {
  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${base}/app/settings/meta-ads?${new URLSearchParams(parametros).toString()}`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(req.url);

  const app = await appDoMetaAds();
  if (!app) return voltar({ erro: "nao_configurado" });

  let estado: ReturnType<typeof verificarEstado>;
  try {
    estado = verificarEstado(url.searchParams.get("state"), { segredo: env.INTERNAL_SECRET, agora: new Date() });
  } catch {
    estado = null;
  }
  if (estado === null) return voltar({ erro: "sessao_expirada" });

  // A pessoa recusou na tela do Facebook, ou a Meta devolveu erro no lugar do código.
  const code = url.searchParams.get("code");
  if (!code) return voltar({ erro: url.searchParams.get("error") === "access_denied" ? "recusado" : "sem_codigo" });

  let token: string;
  try {
    token = await trocarCodigoPorTokenLongo({
      appId: app.appId,
      appSecret: app.appSecret,
      redirectUri: redirectDoMetaAds(),
      // A Meta acrescenta `#_` ao fim do código em algumas voltas.
      code: code.replace(/#_$/, ""),
    });
  } catch (err) {
    logger.error("[meta-ads.oauth] a troca do código falhou", {
      requestId,
      onde: err instanceof MessengerApiError ? err.onde : null,
      erro: err instanceof Error ? err.message : String(err),
    });
    return voltar({ erro: "falha_na_meta" });
  }

  // Lido ANTES de gravar: um login que não alcança conta nenhuma (permissão
  // desmarcada no consentimento, pessoa sem conta de anúncios) não pode
  // substituir uma conexão que funcionava por uma que abre uma tela vazia.
  const contas = await listarContas(token);
  if (!contas.ok) {
    logger.error("[meta-ads.oauth] o token novo não leu as contas", { requestId, falha: contas.falha });
    return voltar({ erro: "sem_permissao" });
  }
  if (contas.dados.length === 0) return voltar({ erro: "nenhuma_conta" });

  const admin = createAdminClient();
  const { data: existente, error: erroDeLeitura } = await admin
    .from("ad_insights_connections")
    .select("default_account_id")
    .eq("organization_id", estado.organizationId)
    .eq("platform", "meta_ads")
    .maybeSingle();
  if (erroDeLeitura) return voltar({ erro: "erro_ao_gravar" });

  // NUNCA em claro — mesma recusa de `updateAdInsightsConnection.ts`.
  const cifrado = await encryptWebhookSecret(admin, token);
  if (!cifrado) return voltar({ erro: "cifra_indisponivel" });

  const anterior = (existente as { default_account_id: string | null } | null)?.default_account_id ?? null;
  const contaPadrao = contaPadraoDepoisDeConectar(contas.dados, anterior);

  const { error } = await admin.from("ad_insights_connections").upsert(
    {
      organization_id: estado.organizationId,
      platform: "meta_ads",
      access_token_encrypted: cifrado,
      default_account_id: contaPadrao,
      updated_by: estado.userId,
    },
    { onConflict: "organization_id,platform" },
  );
  if (error) {
    logger.error("[meta-ads.oauth] a gravação falhou", { requestId, erro: error.message });
    return voltar({ erro: "erro_ao_gravar" });
  }

  void audit({
    action: "ad_insights_connection.updated",
    actorUserId: estado.userId,
    organizationId: estado.organizationId,
    resourceType: "ad_insights_connections",
    resourceId: null,
    requestId,
    // O QUE mudou, jamais o valor: o token não entra nem em metadata.
    metadata: {
      platform: "meta_ads",
      via: "login_do_facebook",
      default_account_id: contaPadrao,
      contas_alcancadas: contas.dados.length,
      token_trocado: true,
      primeira_conexao: !existente,
    },
  });

  return voltar({ conectado: contaPadrao ? "1" : "escolher" });
}
