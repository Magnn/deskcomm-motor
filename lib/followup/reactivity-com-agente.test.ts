/**
 * O que a reatividade faz — e o que NÃO faz — quando o contato manda mensagem e a
 * inscrição está `com_agente` (um agente de IA conduz a conversa dentro de um
 * fluxo, migration 0901).
 *
 * A propriedade é a mesma do `dormente` e vale pelo mesmo mecanismo: não há um
 * `if` de imunidade nesta camada, há a AUSÊNCIA de `com_agente` em `LIVE_STATUSES`.
 * Por isso os casos medem COMPORTAMENTO OBSERVÁVEL (nenhum evento gravado, nenhum
 * patch aplicado), e não a existência de um ramo.
 *
 * Por que importa: a mensagem da pessoa é um TURNO do agente. Se a reatividade a
 * carregasse, a resposta de quem está conversando cancelaria a conversa (política
 * `cancel_on_reply`) ou acordaria o nó (cortando o prazo de silêncio) — o agente
 * seria interrompido pelo próprio fluxo que o chamou.
 *
 *   1. mensagem do contato não toca a inscrição `com_agente`;
 *   2. `cancel_on_reply` — a política que cancela tudo o mais — também não a alcança;
 *   3. STOP/opt-out a ALCANÇA: hard stop não admite exceção de status, e um agente
 *      que continuasse falando com quem pediu silêncio é o pior desfecho possível;
 *   4. controle: quem NÃO está com o agente segue reagindo exatamente como antes.
 */
import { describe, expect, it } from "vitest";

import type { EnrollmentPatch } from "./engine";
import {
  LIVE_STATUSES,
  applyReactivityEvent,
  type LiveEnrollmentRef,
  type ReactivityAdminClient,
} from "./reactivity";
import type { EventRow } from "@/lib/event-log/dispatcher";

const ORG = "11111111-1111-4111-8111-111111111111";
const CONTATO = "22222222-2222-4222-8222-222222222222";
const AGORA = "2026-09-26T12:00:00.000Z";

interface Espiao {
  eventos: Array<{ event_type: string; enrollment_id: string }>;
  patches: Array<{ id: string; patch: EnrollmentPatch }>;
}

function montarDb(
  inscricoes: LiveEnrollmentRef[],
  opts: { bloqueado?: boolean } = {},
): { db: ReactivityAdminClient; espiao: Espiao } {
  const espiao: Espiao = { eventos: [], patches: [] };

  const db: ReactivityAdminClient = {
    async loadConversationContactId() {
      return CONTATO;
    },
    async loadContactBlocked() {
      return opts.bloqueado ?? false;
    },
    async loadLiveEnrollmentsForContact(_org, _contato, statuses) {
      // O filtro do banco, reproduzido: é ele que decide quem a reatividade sequer
      // enxerga, e é nele que a imunidade mora.
      const permitidos = statuses ?? ["active", "waiting_reply", "paused_handoff"];
      return inscricoes.filter((e) => permitidos.includes(e.status));
    },
    async insertEnrollmentEvent(event) {
      espiao.eventos.push({ event_type: event.event_type, enrollment_id: event.enrollment_id });
      return { inserted: true };
    },
    async updateEnrollment(id, _org, patch) {
      espiao.patches.push({ id, patch });
    },
    async agoraNoBanco() {
      return AGORA;
    },
  };

  return { db, espiao };
}

function inscricao(over: Partial<LiveEnrollmentRef> = {}): LiveEnrollmentRef {
  return {
    id: "enr-1",
    status: "com_agente",
    current_node_id: "a1",
    steps_taken: 3,
    pointer_id: "ptr-1",
    handoff_policy: "pause",
    trigger_config: null,
    ...over,
  };
}

function eventoDeInbound(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    organization_id: ORG,
    event_type: "message.received",
    entity_kind: "message",
    entity_id: null,
    payload: { contact_id: CONTATO, direction: "inbound" },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    ...over,
  };
}

describe("reatividade — a inscrição com_agente", () => {
  it("não é vista pela reatividade: `com_agente` está fora de LIVE_STATUSES (a imunidade É esta ausência)", () => {
    expect(LIVE_STATUSES).not.toContain("com_agente");
  });

  it("não é tocada quando o contato manda mensagem — essa mensagem é um turno do agente", async () => {
    const { db, espiao } = montarDb([inscricao()]);

    const s = await applyReactivityEvent(db, () => new Date(AGORA), eventoDeInbound());

    expect(s.reacted).toBe(0);
    expect(espiao.eventos).toEqual([]);
    expect(espiao.patches).toEqual([]);
  });

  it("não é cancelada nem por `cancel_on_reply`", async () => {
    const { db, espiao } = montarDb([
      inscricao({ trigger_config: { kind: "manual", cancel_on_reply: true } }),
    ]);

    const s = await applyReactivityEvent(db, () => new Date(AGORA), eventoDeInbound());

    expect(s.reacted).toBe(0);
    expect(espiao.patches).toEqual([]);
  });

  it("É cancelada no opt-out — o agente não pode continuar falando com quem pediu para parar", async () => {
    const { db, espiao } = montarDb([inscricao()], { bloqueado: true });

    const s = await applyReactivityEvent(db, () => new Date(AGORA), eventoDeInbound());

    expect(s.reacted).toBe(1);
    expect(espiao.patches[0]?.patch.status).toBe("cancelled");
    expect(espiao.patches[0]?.patch.outcome).toBe("opted_out");
  });
});

describe("reatividade — quem não está com o agente segue igual (controle)", () => {
  it("a espera comum é acordada pela mensagem", async () => {
    // Sem este controle, os casos acima passariam por vacuidade se a reatividade
    // tivesse parado de reagir a TUDO.
    const { db, espiao } = montarDb([inscricao({ status: "active", current_node_id: "w1" })]);

    const s = await applyReactivityEvent(db, () => new Date(AGORA), eventoDeInbound());

    expect(s.reacted).toBe(1);
    expect(espiao.eventos.map((e) => e.event_type)).toContain("inbound_woke");
  });

  it("com_agente e comum juntos: só a comum reage", async () => {
    const { db, espiao } = montarDb([
      inscricao({ id: "enr-agente", status: "com_agente" }),
      inscricao({ id: "enr-anda", status: "active", current_node_id: "w1" }),
    ]);

    const s = await applyReactivityEvent(db, () => new Date(AGORA), eventoDeInbound());

    expect(s.reacted).toBe(1);
    expect(espiao.eventos.every((e) => e.enrollment_id === "enr-anda")).toBe(true);
  });
});
