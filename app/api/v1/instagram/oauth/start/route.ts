/**
 * GET /api/v1/instagram/oauth/start (admin) — manda o navegador para o login do
 * Instagram, com o `state` assinado que diz qual organização está conectando.
 *
 * É uma navegação, não uma chamada de API: quem clica em "Conectar Instagram" é
 * levado direto para a tela de consentimento, e a volta cai em `…/oauth/callback`.
 */
import { randomUUID } from "node:crypto";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { urlDeAutorizacao } from "@/lib/channels/instagram/api";
import { appDoInstagram, redirectDoInstagram } from "@/lib/channels/instagram/app";
import { emitirEstado } from "@/lib/channels/instagram/estado";
import { env } from "@/lib/env";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const auth = await requireRole("admin", { requestId, resource: "instagram" });
  if (!auth.ok) return auth.response;
  const t = (texto: string) => traduzir(texto, auth.user.idioma);

  const app = appDoInstagram();
  if (!app) return fail("instagram_nao_configurado", t("O Instagram não está configurado nesta instalação."), 503, { requestId });

  const state = emitirEstado({ organizationId: auth.org.orgId, userId: auth.user.id }, { segredo: env.INTERNAL_SECRET, agora: new Date() });
  return new Response(null, {
    status: 302,
    headers: {
      Location: urlDeAutorizacao({ appId: app.appId, redirectUri: redirectDoInstagram(), state }),
      "Cache-Control": "no-store",
    },
  });
}
