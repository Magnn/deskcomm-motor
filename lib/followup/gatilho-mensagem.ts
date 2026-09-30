/**
 * Gatilho MENSAGEM RECEBIDA (`trigger_config.kind='inbound_message'`).
 *
 * O dono escolhe, na criação do fluxo ou no botão de gatilho, entre: qualquer
 * mensagem, a primeira mensagem do contato, ou uma palavra-chave. Até aqui essa
 * escolha existia só na tela (`localStorage` do navegador) e o motor não a lia —
 * o card dizia «palavra-chave» e nada disparava.
 *
 * EVENT-DRIVEN, irmão de `gatilho-retorno.ts`: o fato é `message.received`, e
 * tudo o que não é a REGRA DE CASAMENTO é reaproveitado de lá (grupo, bloqueado,
 * humano no comando, slot vivo único, gate do agente, origem do serviço,
 * inscrição). Duplicar aquilo aqui seria duas regras de "pode enrolar?" — e o
 * defeito que o `ceder-turno` existe para impedir.
 *
 * ⚠️ UMA VOZ SÓ. O agente também acorda neste inbound. Quem cala o agente é
 * `ceder-turno-a-mensagem.ts`, lendo o evento `enrolled_by_inbound_message` que
 * este produtor grava com o `message_id`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { decidirAgenteDoEnrollmentAutomatico } from "./agent-followup-gate";
import { triggerConfigSchema } from "./api-schemas";
import {
  EVENTO_DE_RETORNO,
  createSupabaseGatilhoRetornoDb,
  humanoNoComando,
  type GatilhoRetornoDb,
  type GatilhoRetornoDeps,
} from "./gatilho-retorno";
import { mensagemDisparaFluxo, type ParamsDaMensagem } from "./mensagem-casa";

export const EVENTO_DE_MENSAGEM = EVENTO_DE_RETORNO;
export const EVENTO_DE_INSCRICAO_POR_MENSAGEM = "enrolled_by_inbound_message";

export interface PointerDeMensagem {
  id: string;
  organization_id: string;
  active_version_id: string;
  params: ParamsDaMensagem;
}

export interface GatilhoMensagemDb extends Omit<GatilhoRetornoDb, "carregaPointersDeRetorno"> {
  carregaPointersDeMensagem(orgId: string): Promise<PointerDeMensagem[]>;
  /** Corpo da mensagem (`null` = mídia sem legenda ou mensagem inexistente). */
  carregaTextoDaMensagem(orgId: string, messageId: string): Promise<string | null>;
}

export interface GatilhoMensagemDeps extends Omit<GatilhoRetornoDeps, "db"> {
  db: GatilhoMensagemDb;
}

export interface GatilhoMensagemSummary {
  matched: boolean;
  pointers_armados: number;
  pointers_barrados_pelo_gate: number;
  enrolled: number;
  skipped_existing: number;
  skipped_stale_origin: number;
  skipped_nao_casou: number;
  skipped_humano: number;
  skipped_grupo: number;
  skipped_bloqueado: number;
  contact_id: string | null;
}

function textoOuNulo(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function vazio(): GatilhoMensagemSummary {
  return {
    matched: false,
    pointers_armados: 0,
    pointers_barrados_pelo_gate: 0,
    enrolled: 0,
    skipped_existing: 0,
    skipped_stale_origin: 0,
    skipped_nao_casou: 0,
    skipped_humano: 0,
    skipped_grupo: 0,
    skipped_bloqueado: 0,
    contact_id: null,
  };
}

/** Aplica UMA linha de `message.received`. Testável contra fake de DB. */
export async function aplicaGatilhoDeMensagem(
  deps: GatilhoMensagemDeps,
  row: EventRow,
): Promise<GatilhoMensagemSummary> {
  const summary = vazio();
  if (row.event_type !== EVENTO_DE_MENSAGEM) return summary;

  const contatoId = textoOuNulo(row.payload.contact_id);
  const conversaId = textoOuNulo(row.payload.conversation_id);
  const mensagemId = textoOuNulo(row.payload.message_id) ?? textoOuNulo(row.entity_id);
  if (!contatoId || !conversaId || !mensagemId) return summary;
  summary.matched = true;
  summary.contact_id = contatoId;

  const armados = await deps.db.carregaPointersDeMensagem(row.organization_id);
  summary.pointers_armados = armados.length;
  if (armados.length === 0) return summary;

  const estado = await deps.db.carregaEstadoDaConversa(row.organization_id, conversaId, contatoId);
  if (!estado) return summary;
  if (estado.is_group) {
    summary.skipped_grupo = armados.length;
    return summary;
  }
  if (estado.is_blocked) {
    summary.skipped_bloqueado = armados.length;
    return summary;
  }
  if (humanoNoComando(estado, deps.clock())) {
    summary.skipped_humano = armados.length;
    return summary;
  }

  const texto = await deps.db.carregaTextoDaMensagem(row.organization_id, mensagemId);
  const anterior = await deps.db.carregaInboundAnterior(row.organization_id, contatoId, mensagemId);
  const vivo = await deps.db.carregaEnrollmentVivo(row.organization_id, contatoId);

  for (const pointer of armados) {
    if (!mensagemDisparaFluxo(pointer.params, texto, anterior === null)) {
      summary.skipped_nao_casou++;
      continue;
    }
    if (vivo && vivo.pointer_id !== pointer.id) {
      summary.skipped_existing++;
      continue;
    }

    const noDeGatilho = await deps.db.carregaNoDeGatilho(row.organization_id, pointer.active_version_id);
    if (!noDeGatilho) continue;
    const { agentId, barrado } = await decidirAgenteDoEnrollmentAutomatico(
      deps.gateDb,
      row.organization_id,
      pointer.id,
      noDeGatilho.pedeAgente,
    );
    if (barrado) {
      summary.pointers_barrados_pelo_gate++;
      continue;
    }

    const { inserted, id, reason } = await deps.db.insereEnrollment({
      service_origin: row.payload.service_origin,
      event_id: row.id,
      organization_id: row.organization_id,
      pointer_id: pointer.id,
      version_id: pointer.active_version_id,
      contact_id: contatoId,
      conversation_id: conversaId,
      current_node_id: noDeGatilho.id,
      agent_id: agentId,
    });
    if (!inserted) {
      if (reason === "stale_origin") summary.skipped_stale_origin++;
      else summary.skipped_existing++;
      continue;
    }
    summary.enrolled++;

    if (id) {
      await deps.db.insereEventoDoEnrollment({
        organization_id: row.organization_id,
        enrollment_id: id,
        node_id: noDeGatilho.id,
        event_type: EVENTO_DE_INSCRICAO_POR_MENSAGEM,
        payload: {
          conversation_id: conversaId,
          message_id: mensagemId,
          event_log_id: row.id,
          match: pointer.params.match,
        },
        idempotency_key: `gatilho-mensagem:${row.id}:${pointer.id}`,
      });
    }
  }

  return summary;
}

export function createSupabaseGatilhoMensagemDb(admin: SupabaseClient): GatilhoMensagemDb {
  const base = createSupabaseGatilhoRetornoDb(admin);
  return {
    carregaInboundAnterior: base.carregaInboundAnterior,
    carregaEstadoDaConversa: base.carregaEstadoDaConversa,
    carregaEnrollmentVivo: base.carregaEnrollmentVivo,
    carregaNoDeGatilho: base.carregaNoDeGatilho,
    insereEnrollment: base.insereEnrollment,
    insereEventoDoEnrollment: base.insereEventoDoEnrollment,

    async carregaPointersDeMensagem(orgId) {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("id, organization_id, active_version_id, trigger_config, surface")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .not("active_version_id", "is", null);
      if (error) throw new Error(error.message);

      const pointers: PointerDeMensagem[] = [];
      for (const row of (data ?? []) as Array<{
        id: string;
        organization_id: string;
        active_version_id: string | null;
        trigger_config: unknown;
        surface?: string | null;
      }>) {
        // Roteiro de atendimento é do turno, nunca do gatilho (mesmo corte do retorno).
        if (!row.active_version_id || row.surface === "atendimento") continue;
        const parsed = triggerConfigSchema.safeParse(row.trigger_config);
        if (!parsed.success || parsed.data.kind !== "inbound_message") continue;
        pointers.push({
          id: row.id,
          organization_id: row.organization_id,
          active_version_id: row.active_version_id,
          params: parsed.data.params,
        });
      }
      return pointers;
    },

    async carregaTextoDaMensagem(orgId, messageId) {
      const { data, error } = await admin
        .from("messages")
        .select("body")
        .eq("organization_id", orgId)
        .eq("id", messageId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const body = (data as { body: string | null } | null)?.body;
      return typeof body === "string" && body.trim() !== "" ? body : null;
    },
  };
}
