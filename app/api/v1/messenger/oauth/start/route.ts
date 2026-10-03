/**
 * GET /api/v1/messenger/oauth/start (admin) — manda o navegador para o login do
 * Facebook, com o `state` assinado que diz qual organização está conectando.
 *
 * É uma navegação, não uma chamada de API: quem clica em "Conectar página" vai
 * direto ao consentimento (onde escolhe as páginas), e a volta cai em
 * `…/oauth/callback`.
 */
import { randomUUID } from "node:crypto";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { urlDeAutorizacao } from "@/lib/channels/messenger/api";
import { appDoMessenger, redirectDoMessenger } from "@/lib/channels/messenger/app";
import { emitirEstado } from "@/lib/channels/messenger/estado";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "channel_sessions" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const app = await appDoMessenger();
  if (!app) return fail("messenger_nao_configurado", t("O Messenger não está configurado nesta instalação."), 503, { requestId });

  const state = emitirEstado({ organizationId: auth.org.orgId, userId: auth.user.id }, { segredo: env.INTERNAL_SECRET, agora: new Date() });
  return new Response(null, {
    status: 302,
    headers: {
      Location: urlDeAutorizacao({ appId: app.appId, redirectUri: redirectDoMessenger(), state, configId: app.configId }),
      "Cache-Control": "no-store",
    },
  });
}
