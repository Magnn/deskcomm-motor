/**
 * FLUXO ESTÁTICO SEGUE COMO FOI CONFIGURADO, MESMO SE ALGUÉM RESPONDER.
 *
 * No fluxo que é dono de um número, o Delay é tempo. Uma resposta do contato no
 * meio do Delay acordava a inscrição e o nó de espera cortava o timer — as
 * mensagens seguintes saíam de uma vez, fora do ritmo desenhado. Aqui se mede o
 * que a reatividade faz com a mensagem que chega, caso a caso.
 */
import { describe, expect, it } from "vitest";

import { applyReactivityEvent, type LiveEnrollmentRef, type ReactivityAdminClient } from "./reactivity";
import type { EnrollmentPatch } from "./engine";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const AGORA = "2026-10-02T12:00:00.000Z";

function montar(inscricoes: LiveEnrollmentRef[], opts: { bloqueado?: boolean } = {}) {
  const eventos: string[] = [];
  const patches: EnrollmentPatch[] = [];
  const db: ReactivityAdminClient = {
    async loadConversationContactId() {
      return CONTATO;
    },
    async loadContactBlocked() {
      return opts.bloqueado ?? false;
    },
    async loadLiveEnrollmentsForContact(_o, _c, statuses) {
      const permitidos = statuses ?? ["active", "waiting_reply", "paused_handoff"];
      return inscricoes.filter((e) => permitidos.includes(e.status));
    },
    async insertEnrollmentEvent(event) {
      eventos.push(event.event_type);
      return { inserted: true };
    },
    async updateEnrollment(_id, _org, patch) {
      patches.push(patch);
    },
    async agoraNoBanco() {
      return AGORA;
    },
  };
  return { db, eventos, patches };
}

const inscricao = (over: Partial<LiveEnrollmentRef> = {}): LiveEnrollmentRef => ({
  id: "enr-1",
  status: "active",
  current_node_id: "delay-1",
  steps_taken: 3,
  pointer_id: "ptr-1",
  handoff_policy: "pause",
  trigger_config: null,
  ...over,
});

const inbound: EventRow = {
  id: "33333333-3333-4333-8333-333333333333",
  organization_id: ORG,
  event_type: "message.received",
  entity_kind: "message",
  entity_id: null,
  payload: { contact_id: CONTATO, direction: "inbound" },
  metadata: {},
  consumed_by: [],
  attempts: 0,
};

const chega = (db: ReactivityAdminClient) => applyReactivityEvent(db, () => new Date(AGORA), inbound);

describe("resposta do contato no meio do fluxo de um número", () => {
  it("no meio de um DELAY: nada acontece — o Delay configurado é respeitado", async () => {
    const { db, eventos, patches } = montar([inscricao({ fluxo_de_numero: true })]);
    const s = await chega(db);
    expect(s.reacted).toBe(0);
    expect(eventos).toEqual([]);
    expect(patches).toEqual([]);
  });

  it("numa caixa que ESPERA RESPOSTA: a resposta avança o fluxo, como sempre", async () => {
    const { db, eventos, patches } = montar([inscricao({ fluxo_de_numero: true, status: "waiting_reply", current_node_id: "pergunta-1" })]);
    const s = await chega(db);
    expect(s.reacted).toBe(1);
    expect(eventos).toEqual(["inbound_woke"]);
    expect(patches[0]).toEqual({ next_eval_at: AGORA });
  });

  it("'Cancelar se o lead responder' ligado é configuração do dono: continua cancelando", async () => {
    const { db, patches } = montar([
      inscricao({ fluxo_de_numero: true, trigger_config: { kind: "manual", cancel_on_reply: true } }),
    ]);
    const s = await chega(db);
    expect(s.reacted).toBe(1);
    expect(patches[0]?.status).toBe("cancelled");
    expect(patches[0]?.outcome).toBe("replied");
  });

  it("pedido de saída (opt-out) para o fluxo — hard stop não tem exceção", async () => {
    const { db, patches } = montar([inscricao({ fluxo_de_numero: true })], { bloqueado: true });
    const s = await chega(db);
    expect(s.reacted).toBe(1);
    expect(patches[0]?.outcome).toBe("opted_out");
  });
});

describe("fluxo de acompanhamento (sem número próprio) — não regride", () => {
  it("a resposta ainda acorda a espera: ali o prazo é teto, não atraso obrigatório", async () => {
    const { db, eventos } = montar([inscricao({})]);
    const s = await chega(db);
    expect(s.reacted).toBe(1);
    expect(eventos).toEqual(["inbound_woke"]);
  });

  it("`fluxo_de_numero: false` explícito é o mesmo que ausente", async () => {
    const { db, eventos } = montar([inscricao({ fluxo_de_numero: false })]);
    await chega(db);
    expect(eventos).toEqual(["inbound_woke"]);
  });
});
