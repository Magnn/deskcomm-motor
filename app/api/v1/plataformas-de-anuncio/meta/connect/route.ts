/**
 * GET /api/v1/plataformas-de-anuncio/meta/connect — começa a conexão da
 * organização com o Meta Ads pelo login do Facebook.
 *
 * Irmã de `../../google/connect/route.ts`, com o mesmo piso de papel (`admin`) e
 * a mesma regra de desfecho: este endereço é aberto pelo navegador num clique de
 * botão, então toda recusa volta para Configurações › Meta Ads com
 * `?erro=<código>`, nunca JSON.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { env } from "@/lib/env";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { appDoMetaAds, emitirEstado, redirectDoMetaAds, urlDeAutorizacao } from "@/lib/plataformas-de-anuncio/meta/login";

export const dynamic = "force-dynamic";

function voltarComErro(codigo: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(`/app/settings/meta-ads?erro=${codigo}`, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = req.headers.get("x-request-id") ?? undefined;

  const autorizado = await requireRole("admin", { requestId, resource: "ad_insights_connections" });
  if (!autorizado.ok) return autorizado.response;
  const { user, org } = autorizado;

  const app = await appDoMetaAds();
  if (!app) return voltarComErro("nao_configurado");

  let state: string;
  try {
    state = emitirEstado({ organizationId: org.orgId, userId: user.id }, { segredo: env.INTERNAL_SECRET, agora: new Date() });
  } catch {
    return voltarComErro("estado_invalido");
  }

  const resposta = NextResponse.redirect(
    urlDeAutorizacao({ appId: app.appId, redirectUri: redirectDoMetaAds(), state, configId: app.configId }),
  );
  resposta.headers.set("Cache-Control", "no-store");
  return resposta;
}
