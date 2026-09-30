/**
 * Adapter fino que pluga `aplicaGatilhoDeMensagem` no dispatcher do `event_log`.
 *
 * Registrado junto do gatilho do cliente que volta: DEPOIS da reatividade (o
 * match_reply dos fluxos já vivos lê a mensagem primeiro) e ANTES do LLM (o
 * agente só fala se `ceder-turno-a-mensagem` deixar).
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { avancarFollowupsAtivosDoContato } from "@/lib/followup/aplicar-inbound";
import {
  EVENTO_DE_MENSAGEM,
  aplicaGatilhoDeMensagem,
  createSupabaseGatilhoMensagemDb,
} from "@/lib/followup/gatilho-mensagem";

export const FOLLOWUP_GATILHO_MENSAGEM_HANDLER_KEY = "followup-gatilho-mensagem.v1";

export const followupGatilhoMensagemHandler: EventHandler = {
  key: FOLLOWUP_GATILHO_MENSAGEM_HANDLER_KEY,
  events: [EVENTO_DE_MENSAGEM],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const summary = await aplicaGatilhoDeMensagem(
        {
          db: createSupabaseGatilhoMensagemDb(admin),
          gateDb: createSupabaseFollowupGateDb(admin),
          clock: () => new Date(),
        },
        row,
      );
      if (summary.enrolled > 0 && summary.contact_id) {
        await avancarFollowupsAtivosDoContato(admin, row.organization_id, summary.contact_id);
      }
      return {
        consumer_key: FOLLOWUP_GATILHO_MENSAGEM_HANDLER_KEY,
        status: summary.matched && summary.enrolled > 0 ? "ok" : "skipped",
        detail:
          `armados=${summary.pointers_armados} enrolled=${summary.enrolled} ` +
          `nao_casou=${summary.skipped_nao_casou} ja_vivo=${summary.skipped_existing} ` +
          `origem_obsoleta=${summary.skipped_stale_origin} gate=${summary.pointers_barrados_pelo_gate} ` +
          `humano=${summary.skipped_humano} grupo=${summary.skipped_grupo} bloqueado=${summary.skipped_bloqueado}`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: FOLLOWUP_GATILHO_MENSAGEM_HANDLER_KEY, status: "error", detail };
    }
  },
};
