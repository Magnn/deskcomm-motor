"use server";

import { headers } from "next/headers";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { appDaMeta } from "@/lib/channels/meta/app";
import { ativarTudoNoAppDaMeta, type ResultadoDoPasso } from "@/lib/channels/meta/ativar-app";
import { env } from "@/lib/env";

export type AtivarAppDaMetaResult =
  | { ok: true; passos: ResultadoDoPasso[] }
  | { ok: false; error: "sem_app_id" | "sem_credencial" | "sem_endereco_publico" };

/**
 * Ativa na Meta tudo o que o produto usa do app desta instalação — o endereço do
 * WhatsApp, o das páginas (Messenger) e os endereços públicos do app — e devolve
 * o que a Meta diz que ficou valendo (`lib/channels/meta/ativar-app.ts`).
 *
 * Roda sozinha depois de salvar o app na tela, e de novo pelo botão quando
 * alguém quer conferir. Pode repetir: cada pedido substitui o anterior.
 *
 * O token de verificação não sai do servidor: é lido de onde já está guardado e
 * vai direto para a Meta.
 *
 * Gate de `is_platform_admin` pelo mesmo motivo de `updateMetaApp.ts`: o objeto
 * é a INSTALAÇÃO, e estes endereços recebem os avisos de todas as empresas dela.
 */
export async function ativarAppDaMeta(): Promise<AtivarAppDaMetaResult> {
  const { user } = await requirePlatformAdmin();

  const { appId, appSecret, verifyToken } = await appDaMeta();
  if (!appId) return { ok: false, error: "sem_app_id" };
  if (!appSecret || !verifyToken) return { ok: false, error: "sem_credencial" };

  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  // A Meta só aceita HTTPS público, e chama os endereços durante o pedido.
  if (!base.startsWith("https://")) return { ok: false, error: "sem_endereco_publico" };

  const passos = await ativarTudoNoAppDaMeta({ appId, appSecret, verifyToken, base });

  const cabecalhos = await headers();
  await audit({
    action: "platform_meta_app.activated",
    actorUserId: user.id,
    resourceType: "platform_meta_app",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    // O resultado de cada passo, jamais o token nem o segredo.
    metadata: { app_id: appId, passos: passos.map((p) => ({ chave: p.chave, ok: p.ok })) },
  });

  return { ok: true, passos };
}
