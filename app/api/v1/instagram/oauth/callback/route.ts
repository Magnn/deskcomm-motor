/**
 * GET /api/v1/instagram/oauth/callback — a volta do consentimento do Instagram.
 *
 * Chega SEM sessão (o cookie é `SameSite=Strict` e não viaja numa navegação vinda
 * de outro site): a organização e a pessoa vêm do `state` assinado, nunca de um
 * parâmetro que o navegador possa trocar.
 *
 *   código → token de longa duração → quem é a conta → grava a conexão (token
 *   cifrado) → liga os avisos de comentário da conta → volta para a tela.
 *
 * Qualquer falha devolve a pessoa para a tela com `?erro=<motivo>`: é ela quem
 * precisa saber o que deu errado, e uma página de erro técnica não diz.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { assinarAvisos, InstagramApiError, lerConta, trocarCodigoPorToken } from "@/lib/channels/instagram/api";
import { appDoInstagram, redirectDoInstagram } from "@/lib/channels/instagram/app";
import { verificarEstado } from "@/lib/channels/instagram/estado";
import { CifraIndisponivelError, ContaDeOutraOrganizacaoError, salvarConexao } from "@/lib/channels/instagram/repositorio";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function voltar(parametro: "conectado" | "erro", valor: string): Response {
  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  return new Response(null, {
    status: 302,
    headers: { Location: `${base}/app/instagram?${parametro}=${encodeURIComponent(valor)}`, "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const url = new URL(req.url);

  const app = appDoInstagram();
  if (!app) return voltar("erro", "nao_configurado");

  const estado = verificarEstado(url.searchParams.get("state"), { segredo: env.INTERNAL_SECRET, agora: new Date() });
  if (estado === null) return voltar("erro", "sessao_expirada");

  // A pessoa recusou na tela do Instagram, ou a Meta devolveu erro no lugar do código.
  const code = url.searchParams.get("code");
  if (!code) return voltar("erro", url.searchParams.get("error") === "access_denied" ? "recusado" : "sem_codigo");

  try {
    const { token, expiraEm } = await trocarCodigoPorToken({
      appId: app.appId,
      appSecret: app.appSecret,
      redirectUri: redirectDoInstagram(),
      // A Meta acrescenta `#_` ao fim do código em algumas voltas.
      code: code.replace(/#_$/, ""),
    });
    const conta = await lerConta(token);
    if (conta === null) return voltar("erro", "conta_pessoal");

    const admin = createAdminClient();
    const conexao = await salvarConexao(admin, { organizationId: estado.organizationId, userId: estado.userId, conta, token, expiraEm });

    // A conexão já existe; se os avisos não ligarem, ela fica marcada para a pessoa
    // ver o motivo e reconectar — em vez de parecer conectada e nunca responder.
    let avisos = true;
    try {
      await assinarAvisos(token);
    } catch (err) {
      avisos = false;
      const motivo = err instanceof Error ? err.message.slice(0, 300) : String(err);
      await admin.from("instagram_connections").update({ status: "error", status_reason: motivo }).eq("id", conexao.id);
      logger.error("[instagram.oauth] avisos de comentário não foram ligados", { requestId, conexao: conexao.id, erro: motivo });
    }

    void audit({
      action: "instagram.conta_conectada",
      actorUserId: estado.userId,
      organizationId: estado.organizationId,
      resourceType: "instagram_connection",
      resourceId: conexao.id,
      requestId,
      metadata: { username: conta.username, avisos },
    });
    return avisos ? voltar("conectado", conta.username) : voltar("erro", "avisos_nao_ligados");
  } catch (err) {
    if (err instanceof ContaDeOutraOrganizacaoError) return voltar("erro", "conta_de_outra_empresa");
    if (err instanceof CifraIndisponivelError) return voltar("erro", "cifra_indisponivel");
    logger.error("[instagram.oauth] a volta do consentimento falhou", {
      requestId,
      onde: err instanceof InstagramApiError ? err.onde : null,
      erro: err instanceof Error ? err.message : String(err),
    });
    return voltar("erro", "falha_na_meta");
  }
}
