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

/**
 * A MENSAGEM QUE CHEGOU NA HORA EM QUE O BANCO NÃO ATENDIA.
 *
 * ⚠️ Medido em produção em 11/10/2026: por seis minutos a camada de dados ficou sem conexão livre
 * ("Timed out acquiring connection from connection pool"), a ingestão devolveu `failed`, a rota
 * respondeu 200 e a Meta deu a entrega por feita. A mensagem da pessoa não existe no histórico e
 * o agente nunca a viu. O 200 incondicional protege contra re-entrega em loop do que NUNCA vai
 * entrar; para o que só não entrou AGORA ele é perda de mensagem.
 *
 * Reconhecida pela mensagem do erro, que é o que a ingestão devolve. Na dúvida é definitiva: pedir
 * re-entrega do que não tem conserto é o loop que o 200 existe para evitar.
 */
const FALHA_PASSAGEIRA =
  /connection pool|timed? ?out|timeout|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|too many clients|max clients|terminating connection|could not connect|bad gateway|service unavailable|gateway time/i;

export function ehFalhaPassageira(motivo: string): boolean {
  return FALHA_PASSAGEIRA.test(motivo);
}

/** O desfecho que faz a rota responder 503, para a Meta entregar o aviso de novo. */
export const DESFECHO_PASSAGEIRO = "failed_transient";

/** Os avisos que a rota acabou de aplicar pedem re-entrega? Pura. */
export function pedeReentrega(desfechos: readonly string[]): boolean {
  return desfechos.includes(DESFECHO_PASSAGEIRO);
}

const ESPERAS_DA_NOVA_TENTATIVA_MS = [400, 1200] as const;
const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

export async function aplicarEventoDaMeta(
  admin: SupabaseClient,
  e: MetaWebhookEvent,
  session: MetaWebhookSession,
  now: string,
): Promise<string | null> {
  if (e.kind === "inbound_message" || e.kind === "outbound_echo") {
    // A organização vem de quem resolveu a sessão, nunca do corpo: é a mesma
    // fonte que decide onde os dois updates abaixo escrevem (issue #236).
    const ingerir = () =>
      e.kind === "inbound_message"
        ? ingestMetaInbound(admin, e, { organizationId: session.organizationId })
        : ingestMetaEcho(admin, e, { organizationId: session.organizationId });
    let r = await ingerir();
    // Falha PASSAGEIRA (banco sem conexão livre, rede) se tenta de novo aqui mesmo: a ingestão é
    // idempotente pela `external_id`, e a espera é curta para a Meta não desistir da chamada.
    for (const espera of ESPERAS_DA_NOVA_TENTATIVA_MS) {
      if (r.status !== "failed" || !ehFalhaPassageira(r.reason)) break;
      await esperar(espera);
      r = await ingerir();
    }
    if (r.status === "failed" || r.status === "no_session") {
      const passageira = r.status === "failed" && ehFalhaPassageira(r.reason);
      // Falha definitiva segue 2xx (a Meta re-entregaria em loop o que nunca vai entrar), mas NÃO
      // fica muda: vai ao log estruturado e ao corpo da resposta. A passageira é devolvida como
      // `failed_transient`, e a rota responde 503 para a Meta entregar de novo.
      logger.error("[meta.ingest] mensagem não ingerida", {
        kind: e.kind,
        status: r.status,
        reason: r.status === "failed" ? r.reason : undefined,
        vai_pedir_reentrega: passageira,
        external_id: e.externalId,
        phone_number_id: e.phoneNumberId,
      });
      if (passageira) return DESFECHO_PASSAGEIRO;
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
