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

import { sincronizarSaudeDaConexao } from "../health";
import { ingestMetaEcho, ingestMetaInbound } from "./ingest";
import type { MetaWebhookSession } from "./session";
import { statusUpdate } from "./status-update";
import type { AccountUpdateEvent, ContactSyncEvent, MetaWebhookEvent } from "./webhook";

/**
 * A AGENDA DO CELULAR VIRA CONTATO — e só isso.
 *
 * Passa pela mesma `fn_upsert_wa_contact` da ingestão, que reencontra o contato
 * pelas duas grafias do nono dígito e só preenche o nome quando o CRM ainda não
 * tem um: o nome que a equipe escreveu aqui vale mais que o do celular.
 *
 * O que NÃO acontece, de propósito: conversa, lead, rodízio, agente. Contato
 * salvo no celular não é alguém que escreveu — criar conversa para cada um
 * encheria a Inbox de vazio e acordaria o agente para gente que não falou.
 *
 * `remove` (apagado da agenda do celular) não apaga contato do CRM: o histórico
 * de atendimento continua sendo da empresa, e apagar é decisão de quem atende.
 */
async function aplicarAgendaDoAplicativo(
  admin: SupabaseClient,
  e: ContactSyncEvent,
  session: MetaWebhookSession,
): Promise<string> {
  let gravados = 0;
  for (const c of e.contatos) {
    if (c.acao !== "add") continue;
    const { error } = await admin.rpc(
      "fn_upsert_wa_contact" as never,
      {
        p_org: session.organizationId,
        p_kind: "phone",
        p_phone: `+${c.telefone}`,
        p_lid: null,
        p_chat_id: c.telefone,
        p_notify: c.nome,
      } as never,
    );
    if (error) {
      if (ehFalhaPassageira(error.message)) return DESFECHO_PASSAGEIRO;
      logger.error("[meta.contatos] contato da agenda não gravado", {
        organization_id: session.organizationId,
        erro: error.message,
      });
      continue;
    }
    gravados += 1;
  }
  return gravados > 0 ? "contacts_synced" : "contacts_skipped";
}

/** O estado do canal depois de cada evento da conta. */
const STATUS_DO_EVENTO: Record<AccountUpdateEvent["evento"], "STOPPED" | "WORKING"> = {
  PARTNER_REMOVED: "STOPPED",
  ACCOUNT_OFFBOARDED: "STOPPED",
  ACCOUNT_RECONNECTED: "WORKING",
};

/**
 * O CLIENTE DESCONECTOU — e o canal não pode seguir "conectado" e mudo.
 *
 * Em coexistência o cliente desfaz a conexão pelo próprio celular, sem passar
 * pelo CRM; e a Meta desliga sozinha por inatividade. O único aviso é este
 * evento. Ele grava o estado no canal e passa pelo vigia de saúde
 * (`sincronizarSaudeDaConexao`), que abre o aviso na Central uma vez por
 * episódio e o FECHA quando chega `ACCOUNT_RECONNECTED`. Origem "empurrão": a
 * varredura de credencial não enxerga o número desligado e não pode fechar o
 * que a Meta abriu.
 */
async function aplicarMudancaDaConta(
  admin: SupabaseClient,
  e: AccountUpdateEvent,
  session: MetaWebhookSession,
  now: string,
): Promise<string> {
  const status = STATUS_DO_EVENTO[e.evento];
  const { data: canal, error } = await admin
    .from("channel_sessions")
    .update({ status, updated_at: now })
    .eq("organization_id", session.organizationId)
    .eq("id", session.id)
    .select("display_name, phone_number")
    .maybeSingle();
  if (error) {
    if (ehFalhaPassageira(error.message)) return DESFECHO_PASSAGEIRO;
    logger.error("[meta.conta] estado do canal não gravado", {
      organization_id: session.organizationId,
      evento: e.evento,
      erro: error.message,
    });
    return "failed";
  }

  const linha = (canal ?? {}) as { display_name?: string | null; phone_number?: string | null };
  const detalhe = [e.evento, e.motivo, e.iniciadoPor].filter(Boolean).join(" · ");
  await sincronizarSaudeDaConexao(
    admin,
    { id: session.id, organization_id: session.organizationId, status },
    { reachable: true, status, detail: status === "WORKING" ? null : detalhe },
    linha.display_name ?? linha.phone_number ?? "WhatsApp oficial",
    "empurrao",
  );
  return status === "WORKING" ? "account_reconnected" : "account_disconnected";
}

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

  if (e.kind === "contact_sync") return await aplicarAgendaDoAplicativo(admin, e, session);
  if (e.kind === "account_update") return await aplicarMudancaDaConta(admin, e, session, now);

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
