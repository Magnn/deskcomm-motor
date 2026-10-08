/**
 * GET|POST /api/v1/webhooks/meta — a URL DO APP da WhatsApp Cloud API.
 *
 * A Meta entrega por duas portas. As mensagens de cada número vão para a URL
 * registrada para ELE (`/api/v1/webhooks/meta/[token]`, que o CRM aponta sozinho
 * ao conectar). Tudo o que a Meta não deixa apontar por número cai na URL do
 * app, que é uma só para a instalação inteira — o estado dos modelos e, no
 * número em coexistência, as mensagens que o negócio manda pelo aplicativo do
 * celular.
 *
 * Sem token no path, a organização não vem da URL. A origem é provada pela
 * assinatura do App Secret; o destino sai do número que o aviso carrega, que o
 * banco garante ser de um canal só, ou — no aviso que é da conta inteira — de
 * todo canal ativo daquela conta. A regra está em `metaSessionsDoAviso`.
 *
 * Mesma disciplina da rota por número: `hub.challenge` em texto puro, e 200 para
 * tudo que chega com assinatura válida, inclusive o que não nos interessa (a Meta
 * re-entrega em backoff o que não recebe 2xx).
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { aplicarEventoDaMeta } from "@/lib/channels/meta/aplicar-evento";
import { appDaMeta } from "@/lib/channels/meta/app";
import { lerEnvelopeMeta } from "@/lib/channels/meta/envelope";
import { metaSessionsDoAviso } from "@/lib/channels/meta/session";
import { parseMetaWebhook, verificationChallenge, verifyMetaSignature } from "@/lib/channels/meta/webhook";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { verifyToken } = await appDaMeta();
  const challenge = verificationChallenge(req.nextUrl.searchParams, verifyToken ?? "");
  if (challenge === null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const rawBody = await req.text();

  const { appSecret } = await appDaMeta();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), appSecret ?? "")) {
    return fail("unauthorized", "invalid_signature", 401, { requestId });
  }

  const leitura = lerEnvelopeMeta(rawBody);
  if (!leitura.ok) {
    if (leitura.motivo === "json_invalido") return fail("invalid_request", "invalid_json", 400, { requestId });
    logger.error("[meta.webhook.app] payload fora do contrato do canal", {
      request_id: requestId,
      campos: leitura.campos,
    });
    return fail("validation_failed", "payload fora do contrato do canal", 400, {
      requestId,
      details: { campos: leitura.campos },
    });
  }

  const eventos = parseMetaWebhook(leitura.envelope);
  const admin = createAdminClient();
  const now = new Date().toISOString();
  const desfechos: string[] = [];

  for (const e of eventos) {
    const sessoes = await metaSessionsDoAviso(
      e.kind === "inbound_message" || e.kind === "outbound_echo"
        ? { phoneNumberId: e.phoneNumberId }
        : { wabaId: e.wabaId },
    );
    // Número ou conta que ninguém conectou aqui: o app serve outras instalações
    // do mesmo dono, ou o canal foi excluído. Não é erro.
    if (sessoes.length === 0) {
      desfechos.push("no_session");
      continue;
    }
    for (const session of sessoes) {
      const desfecho = await aplicarEventoDaMeta(admin, e, session, now);
      if (desfecho) desfechos.push(desfecho);
    }
  }

  return NextResponse.json({ received: eventos.length, outcomes: desfechos }, { status: 200 });
}
