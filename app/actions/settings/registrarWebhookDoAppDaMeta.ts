"use server";

import { headers } from "next/headers";

import { audit } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { appDaMeta } from "@/lib/channels/meta/app";
import { registrarWebhookDoApp } from "@/lib/channels/meta/webhook-do-app";
import { env } from "@/lib/env";

export type RegistrarWebhookDoAppResult =
  | { ok: true; url: string }
  | { ok: false; error: "sem_app_id" | "sem_credencial" | "sem_endereco_publico" | "recusado_pela_meta"; motivo?: string };

/**
 * Registra na Meta o endereço do app desta instalação — o que antes pedia colar
 * a URL e o token de verificação no painel dela.
 *
 * O token não sai do servidor: é lido de onde já está guardado e vai direto para
 * a Meta. Quem perdeu o valor (ele é exibido uma vez só) não precisa gerar outro.
 *
 * Gate de `is_platform_admin` pelo mesmo motivo de `updateMetaApp.ts`: o objeto
 * é a INSTALAÇÃO, e este endereço recebe os avisos de todas as empresas dela.
 */
export async function registrarWebhookDoAppDaMeta(): Promise<RegistrarWebhookDoAppResult> {
  const { user } = await requirePlatformAdmin();

  const appId = (env.META_APP_ID ?? "").trim();
  if (appId === "") return { ok: false, error: "sem_app_id" };

  const { appSecret, verifyToken } = await appDaMeta();
  if (!appSecret || !verifyToken) return { ok: false, error: "sem_credencial" };

  const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  // A Meta só aceita HTTPS público, e chama o endereço durante o pedido.
  if (!base.startsWith("https://")) return { ok: false, error: "sem_endereco_publico" };

  const r = await registrarWebhookDoApp({
    appId,
    appSecret,
    verifyToken,
    callbackUrl: `${base}/api/v1/webhooks/meta`,
  });

  if (!r.ok) return { ok: false, error: "recusado_pela_meta", motivo: r.motivo };
  const cabecalhos = await headers();

  await audit({
    action: "platform_meta_app.webhook_registered",
    actorUserId: user.id,
    resourceType: "platform_meta_app",
    resourceId: null,
    requestId: cabecalhos.get("x-request-id") ?? undefined,
    ip: cabecalhos.get("x-forwarded-for") ?? undefined,
    userAgent: cabecalhos.get("user-agent") ?? undefined,
    actingAsPlatformAdmin: true,
    // O endereço, jamais o token nem o segredo.
    metadata: { url: r.url },
  });

  return { ok: true, url: r.url };
}
