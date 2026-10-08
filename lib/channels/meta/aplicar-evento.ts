/**
 * O que o CRM faz com UM evento da Cloud API, já amarrado à sessão dona dele.
 *
 * Mora aqui, e não na rota, porque são duas as portas por onde a Meta entrega:
 * a URL do número (com token no path) e a URL do app (sem token). As duas decidem
 * por caminhos diferentes QUAL sessão é a dona; o que se faz com o evento depois
 * disso é uma coisa só.
 *
 * Devolve o desfecho quando há um para contar (mensagem que entrou ou saiu), e
 * `null` para os eventos que só atualizam linha.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { ingestMetaEcho, ingestMetaInbound } from "./ingest";
import type { MetaWebhookSession } from "./session";
import { statusUpdate } from "./status-update";
import type { MetaWebhookEvent } from "./webhook";

export async function aplicarEventoDaMeta(
  admin: SupabaseClient,
  e: MetaWebhookEvent,
  session: MetaWebhookSession,
  now: string,
): Promise<string | null> {
  if (e.kind === "inbound_message" || e.kind === "outbound_echo") {
    // A organização vem de quem resolveu a sessão, nunca do corpo: é a mesma
    // fonte que decide onde os dois updates abaixo escrevem (issue #236).
    const r =
      e.kind === "inbound_message"
        ? await ingestMetaInbound(admin, e, { organizationId: session.organizationId })
        : await ingestMetaEcho(admin, e, { organizationId: session.organizationId });
    if (r.status === "failed" || r.status === "no_session") {
      // 2xx continua (a Meta re-entregaria em loop), mas a falha NÃO fica muda:
      // vai ao log estruturado e ao corpo da resposta.
      logger.error("[meta.ingest] mensagem não ingerida", {
        kind: e.kind,
        status: r.status,
        reason: r.status === "failed" ? r.reason : undefined,
        external_id: e.externalId,
        phone_number_id: e.phoneNumberId,
      });
    }
    return r.status;
  }

  if (e.kind === "template_status") {
    await admin
      .from("meta_templates")
      .update({ status: e.event, rejected_reason: e.reason, updated_at: now })
      .eq("organization_id", session.organizationId)
      .eq("waba_id", e.wabaId)
      .eq("name", e.templateName)
      .eq("language", e.templateLanguage);
    return null;
  }

  // O evento inteiro vira colunas, não só `status`: quando a Meta ACEITA o
  // template e reprova a entrega depois, o motivo só existe aqui. Ver
  // `lib/channels/meta/status-update.ts`.
  await admin
    .from("messages")
    .update(statusUpdate(e, now))
    .eq("organization_id", session.organizationId)
    .eq("external_id", e.externalId);
  return null;
}
