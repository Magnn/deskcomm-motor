/**
 * O HISTÓRICO DO CELULAR VIRA CONVERSA — e só isso.
 *
 * Num número em coexistência, a Meta entrega até 180 dias de conversa do
 * aplicativo do celular (aviso `history`), uma vez, se o CRM pedir nas 24 h
 * seguintes à conexão (`pedirHistoricoDoAplicativo`). Cada contato vira uma
 * chamada a `fn_importar_historico_da_conversa` (migration 0929), que grava o
 * lote inteiro numa operação.
 *
 * O que NÃO acontece, de propósito — são mensagens que JÁ aconteceram:
 *   - nenhum `message.received` (a IA não responde conversa de julho);
 *   - nenhuma demanda aberta, nenhuma conversa reaberta, nada na Fila;
 *   - nenhum lead, rodízio, opt-out ou contador de não lidas;
 *   - a mídia não é baixada: só o ponteiro da Meta fica em `metadata`. Baixar
 *     180 dias de foto e áudio gastaria a cota de armazenamento da instalação
 *     inteira, e o link da Meta expira antes de alguém abrir a conversa.
 *
 * Idempotente pela `external_id`: a Meta re-entrega o que não recebe 2xx, e o
 * eco que já entrou ao vivo não é gravado de novo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { encontrarContatoPorTelefone } from "../contato-por-telefone";
import { canonicalPhoneBR } from "../phone-variants";
import { sessionByPhoneNumberId } from "./ingest";
import type { MetaWebhookSession } from "./session";
import type { HistorySyncEvent, MensagemDoHistorico } from "./webhook";

/** O código da Meta para "o negócio não quis compartilhar o histórico". */
export const HISTORICO_RECUSADO_PELO_NEGOCIO = 2593109;

export type DesfechoDoHistorico =
  | { status: "imported"; conversas: number; mensagens: number }
  | { status: "declined"; codigo: number | null }
  | { status: "no_session" }
  | { status: "failed"; reason: string; conversas: number; mensagens: number };

/** O formato que a função do banco lê. Puro. */
export function linhasDoHistorico(mensagens: readonly MensagemDoHistorico[]) {
  return mensagens.map((m) => ({
    external_id: m.externalId,
    direction: m.direcao,
    type: m.type,
    body: m.text,
    sent_at: m.sentAt.toISOString(),
    status: m.status,
    media_mime: m.mime,
    metadata: m.mediaId ? { meta_media_id: m.mediaId } : {},
  }));
}

export async function ingestMetaHistorico(
  admin: SupabaseClient,
  e: HistorySyncEvent,
  session: MetaWebhookSession,
): Promise<DesfechoDoHistorico> {
  if (e.recusa) {
    logger.info("[meta.historico] o negócio não compartilhou o histórico do celular", {
      organization_id: session.organizationId,
      codigo: e.recusa.codigo,
      titulo: e.recusa.titulo,
    });
    return { status: "declined", codigo: e.recusa.codigo };
  }

  const orgId = session.organizationId;
  let conversas = 0;
  let mensagens = 0;
  // A sessão do NÚMERO que o aviso carrega, dentro da organização de quem
  // resolveu a porta — a mesma regra do eco (`ingestMetaEcho`).
  let canal: { id: string } | null;
  try {
    canal = await sessionByPhoneNumberId(admin, orgId, e.phoneNumberId);
  } catch (err) {
    return { status: "failed", reason: err instanceof Error ? err.message : "sessao_do_numero", conversas, mensagens };
  }
  if (!canal) return { status: "no_session" };
  for (const fio of e.conversas) {
    const existente = await encontrarContatoPorTelefone(admin as never, orgId, fio.contato);
    const phone = existente?.phone_number
      ? canonicalPhoneBR(existente.phone_number)
      : canonicalPhoneBR(`+${fio.contato}`);

    const { data: contactId, error: erroContato } = await admin.rpc(
      "fn_upsert_wa_contact" as never,
      { p_org: orgId, p_kind: "phone", p_phone: phone, p_lid: null, p_chat_id: fio.contato, p_notify: null } as never,
    );
    if (erroContato || !contactId) {
      return { status: "failed", reason: `contato: ${erroContato?.message ?? "sem id"}`, conversas, mensagens };
    }

    const { data, error } = await admin.rpc(
      "fn_importar_historico_da_conversa" as never,
      {
        p_org: orgId,
        p_session: canal.id,
        p_contact: contactId as string,
        p_mensagens: linhasDoHistorico(fio.mensagens),
      } as never,
    );
    if (error) return { status: "failed", reason: `historico: ${error.message}`, conversas, mensagens };

    const linha = (Array.isArray(data) ? data[0] : data) as { inseridas?: number } | null;
    const inseridas = linha?.inseridas ?? 0;
    if (inseridas > 0) conversas += 1;
    mensagens += inseridas;
  }

  logger.info("[meta.historico] pedaço do histórico do celular gravado", {
    organization_id: orgId,
    fase: e.fase,
    progresso: e.progresso,
    conversas,
    mensagens,
  });
  return { status: "imported", conversas, mensagens };
}
