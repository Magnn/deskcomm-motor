/**
 * GET /api/v1/messenger/oauth/callback — a volta do login do Facebook.
 *
 * Chega SEM sessão (o cookie é `SameSite=Strict` e não viaja numa navegação
 * vinda de outro site): a organização e a pessoa vêm do `state` assinado, nunca
 * de um parâmetro que o navegador possa trocar.
 *
 *   código → token longo → páginas autorizadas → cada uma vira canal, com os
 *   avisos ligados → volta para Conexões › Messenger com o resumo.
 *
 * Qualquer falha devolve a pessoa para a tela com `?erro=<motivo>`: é ela quem
 * precisa saber o que deu errado, e uma página de erro técnica não diz.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { MessengerApiError, trocarCodigoPorTokenLongo } from "@/lib/channels/messenger/api";
import { appDoMessenger, redirectDoMessenger, webhookDoMessenger } from "@/lib/channels/messenger/app";
import { conectarPaginas, depsReaisDaConexao } from "@/lib/channels/messenger/conexao";
import { verificarEstado } from "@/lib/channels/messenger/estado";
import { CifraIndisponivelError } from "@/lib/channels/messenger/paginas";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function voltar(parametros: Record<string, string>): Response {
  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  const q = new URLSearchParams({ aba: "messenger", ...parametros });
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/app/connections?${q.toString()}`, "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(req.url);

  const app = await appDoMessenger();
  if (!app) return voltar({ erro: "nao_configurado" });

  const estado = verificarEstado(url.searchParams.get("state"), { segredo: env.INTERNAL_SECRET, agora: new Date() });
  if (estado === null) return voltar({ erro: "sessao_expirada" });

  // A pessoa recusou na tela do Facebook, ou a Meta devolveu erro no lugar do código.
  const code = url.searchParams.get("code");
  if (!code) return voltar({ erro: url.searchParams.get("error") === "access_denied" ? "recusado" : "sem_codigo" });

  try {
    const tokenDoUsuario = await trocarCodigoPorTokenLongo({
      appId: app.appId,
      appSecret: app.appSecret,
      redirectUri: redirectDoMessenger(),
      // A Meta acrescenta `#_` ao fim do código em algumas voltas.
      code: code.replace(/#_$/, ""),
    });

    const resultados = await conectarPaginas(
      createAdminClient(),
      depsReaisDaConexao({ appId: app.appId, appSecret: app.appSecret, verifyToken: app.verifyToken, callbackUrl: webhookDoMessenger() }),
      { organizationId: estado.organizationId, userId: estado.userId, tokenDoUsuario },
    );
    if (resultados.length === 0) return voltar({ erro: "nenhuma_pagina" });

    const conectadas = resultados.filter((r) => r.resultado === "conectada" || r.resultado === "reconectada");
    void audit({
      action: "messenger.paginas_conectadas",
      actorUserId: estado.userId,
      organizationId: estado.organizationId,
      resourceType: "channel_session",
      resourceId: null,
      requestId,
      // Nome e id das páginas: o que permite reconhecer no histórico. Nenhum token.
      metadata: { paginas: resultados.map((r) => ({ id: r.pageId, nome: r.nome, resultado: r.resultado })) },
    });

    const recusadas = resultados.filter((r) => !conectadas.includes(r)).map((r) => r.resultado);
    return voltar({
      conectadas: String(conectadas.length),
      ...(recusadas.length > 0 ? { recusas: [...new Set(recusadas)].join(",") } : {}),
    });
  } catch (err) {
    if (err instanceof CifraIndisponivelError) return voltar({ erro: "cifra_indisponivel" });
    logger.error("[messenger.oauth] a volta do consentimento falhou", {
      requestId,
      onde: err instanceof MessengerApiError ? err.onde : null,
      erro: err instanceof Error ? err.message : String(err),
    });
    return voltar({ erro: "falha_na_meta" });
  }
}
