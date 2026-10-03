/**
 * O APP DA META desta instalação, visto pelo Messenger.
 *
 * É o MESMO app do WhatsApp oficial: o segredo que assina a entrega e o token do
 * handshake vêm de `appDaMeta()` (banco primeiro, `.env` como piso — a regra e o
 * porquê estão em `lib/channels/meta/app.ts`). Daqui só sai o que o Messenger
 * acrescenta: o ID do app, que o login do Facebook exige e que não mora no banco.
 *
 * Sem os três (id, segredo, token), o recurso inteiro fica DESLIGADO: as rotas
 * respondem que não está configurado e o webhook não aceita nada.
 */
import { appDaMeta } from "@/lib/channels/meta/app";
import { env } from "@/lib/env";

export interface AppDoMessenger {
  appId: string;
  appSecret: string;
  verifyToken: string;
  /** Configuração do "Login do Facebook para Empresas", quando houver. */
  configId: string | null;
}

export async function appDoMessenger(): Promise<AppDoMessenger | null> {
  const appId = (env.META_APP_ID ?? "").trim();
  const { appSecret, verifyToken } = await appDaMeta();
  if (appId === "" || !appSecret || !verifyToken) return null;
  const configId = (env.META_MESSENGER_CONFIG_ID ?? "").trim();
  return { appId, appSecret, verifyToken, configId: configId === "" ? null : configId };
}

function base(): string {
  return (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
}

/** Para onde a Meta devolve o navegador depois do consentimento. Tem de estar cadastrado no app. */
export function redirectDoMessenger(): string {
  return `${base()}/api/v1/messenger/oauth/callback`;
}

/** A URL única que recebe os avisos de TODAS as páginas (um webhook por app). */
export function webhookDoMessenger(): string {
  return `${base()}/api/v1/webhooks/messenger`;
}
