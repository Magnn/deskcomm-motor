import { describe, expect, it } from "vitest";

import type { EventRow } from "@/lib/event-log/dispatcher";
import type { EnabledFollowupAgent, FollowupGateDb } from "./agent-followup-gate";
import type { EstadoDaConversaDeRetorno } from "./gatilho-retorno";
import {
  EVENTO_DE_INSCRICAO_POR_MENSAGEM,
  EVENTO_DE_MENSAGEM,
  aplicaGatilhoDeMensagem,
  type GatilhoMensagemDb,
  type PointerDeMensagem,
} from "./gatilho-mensagem";
import { deveCederTurnoAMensagem } from "./ceder-turno-a-mensagem";
import { gatilhoDaEscolha, descreverGatilho } from "./gatilho-da-criacao";

const ORG = "11111111-1111-1111-1111-111111111111";
const POINTER = "22222222-2222-2222-2222-222222222222";
const OUTRO_POINTER = "22222222-2222-2222-2222-999999999999";
const AGENT = "33333333-3333-3333-3333-333333333333";
const CONTATO = "55555555-5555-5555-5555-555555555555";
const CONVERSA = "66666666-6666-6666-6666-666666666666";
const MENSAGEM = "77777777-7777-7777-7777-777777777777";
const VERSION = "99999999-9999-9999-9999-999999999999";
const CLOCK = () => new Date("2026-09-30T12:00:00.000Z");

interface Registro {
  enrollments: unknown[];
  eventos: Array<{ event_type: string; payload: Record<string, unknown>; idempotency_key: string }>;
}

function fakeDb(opts: {
  pointers: PointerDeMensagem[];
  texto?: string | null;
  anterior?: Date | null;
  estado?: Partial<EstadoDaConversaDeRetorno>;
  vivo?: { pointer_id: string } | null;
  registro: Registro;
}): GatilhoMensagemDb {
  return {
    async carregaPointersDeMensagem() {
      return opts.pointers;
    },
    async carregaTextoDaMensagem() {
      return opts.texto === undefined ? "oi" : opts.texto;
    },
    async carregaInboundAnterior() {
      return opts.anterior === undefined ? new Date("2026-09-01T00:00:00Z") : opts.anterior;
    },
    async carregaEstadoDaConversa() {
      return {
        is_group: false,
        is_blocked: false,
        force_human: false,
        assignee_kind: "ai",
        bot_silenced_until: null,
        tags: [],
        ...opts.estado,
      };
    },
    async carregaEnrollmentVivo() {
      return opts.vivo ?? null;
    },
    async carregaNoDeGatilho() {
      return { id: "t1", pedeAgente: true };
    },
    async insereEnrollment(input) {
      opts.registro.enrollments.push(input);
      return { inserted: true, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
    },
    async insereEventoDoEnrollment(e) {
      opts.registro.eventos.push({ event_type: e.event_type, payload: e.payload, idempotency_key: e.idempotency_key });
    },
  };
}

const gate = (agentes: EnabledFollowupAgent[]): FollowupGateDb => ({
  async loadEnabledPublishedFollowupAgents() {
    return agentes;
  },
});

function evento(over: Partial<EventRow> = {}): EventRow {
  return {
    id: "e0000000-0000-4000-8000-000000000001",
    organization_id: ORG,
    event_type: EVENTO_DE_MENSAGEM,
    entity_kind: "message",
    entity_id: MENSAGEM,
    payload: { contact_id: CONTATO, conversation_id: CONVERSA, message_id: MENSAGEM },
    metadata: {},
    consumed_by: [],
    attempts: 0,
    ...over,
  };
}

const pointer = (params: PointerDeMensagem["params"], id = POINTER): PointerDeMensagem => ({
  id,
  organization_id: ORG,
  active_version_id: VERSION,
  params,
});

const agentes: EnabledFollowupAgent[] = [{ agentId: AGENT, pointerIds: [POINTER, OUTRO_POINTER] }];

async function roda(opts: Parameters<typeof fakeDb>[0], e: EventRow = evento()) {
  return aplicaGatilhoDeMensagem({ db: fakeDb(opts), gateDb: gate(agentes), clock: CLOCK }, e);
}

describe("aplicaGatilhoDeMensagem — dispara", () => {
  it("palavra-chave que casa inscreve o contato e grava o message_id (a voz única depende dele)", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda(
      { pointers: [pointer({ match: "keyword", keywords: ["quero"] })], texto: "Eu QUERO o ritual", registro },
    );
    expect(s.enrolled).toBe(1);
    expect(registro.eventos[0]).toMatchObject({
      event_type: EVENTO_DE_INSCRICAO_POR_MENSAGEM,
      payload: { message_id: MENSAGEM, match: "keyword" },
    });
  });

  it("qualquer mensagem inscreve", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [pointer({ match: "any" })], registro });
    expect(s.enrolled).toBe(1);
  });

  it("primeira mensagem só inscreve quem nunca escreveu antes", async () => {
    const r1: Registro = { enrollments: [], eventos: [] };
    const nova = await roda({ pointers: [pointer({ match: "first_message" })], anterior: null, registro: r1 });
    expect(nova.enrolled).toBe(1);

    const r2: Registro = { enrollments: [], eventos: [] };
    const antiga = await roda({ pointers: [pointer({ match: "first_message" })], registro: r2 });
    expect(antiga.enrolled).toBe(0);
    expect(antiga.skipped_nao_casou).toBe(1);
  });
});

describe("aplicaGatilhoDeMensagem — NÃO dispara", () => {
  it("palavra que não casa não inscreve", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [pointer({ match: "keyword", keywords: ["quero"] })], texto: "bom dia", registro });
    expect(s.enrolled).toBe(0);
    expect(registro.enrollments).toHaveLength(0);
  });

  it("mídia sem legenda não casa palavra-chave", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [pointer({ match: "keyword", keywords: ["quero"] })], texto: null, registro });
    expect(s.enrolled).toBe(0);
  });

  it("grupo, bloqueado e humano no comando não disparam", async () => {
    for (const estado of [{ is_group: true }, { is_blocked: true }, { force_human: true }, { assignee_kind: "user" }]) {
      const registro: Registro = { enrollments: [], eventos: [] };
      const s = await roda({ pointers: [pointer({ match: "any" })], estado, registro });
      expect(s.enrolled).toBe(0);
    }
  });

  it("contato já em outro fluxo vivo não é inscrito de novo", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [pointer({ match: "any" })], vivo: { pointer_id: OUTRO_POINTER }, registro });
    expect(s.enrolled).toBe(0);
    expect(s.skipped_existing).toBe(1);
  });

  it("sem fluxo armado, não faz nada", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [], registro });
    expect(s.matched).toBe(true);
    expect(s.enrolled).toBe(0);
  });

  it("evento de outro tipo não é reconhecido", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await roda({ pointers: [pointer({ match: "any" })], registro }, evento({ event_type: "lead.created" }));
    expect(s.matched).toBe(false);
  });

  it("gate do agente: fluxo que pede IA sem agente armado não inscreve", async () => {
    const registro: Registro = { enrollments: [], eventos: [] };
    const s = await aplicaGatilhoDeMensagem(
      { db: fakeDb({ pointers: [pointer({ match: "any" })], registro }), gateDb: gate([]), clock: CLOCK },
      evento(),
    );
    expect(s.enrolled).toBe(0);
    expect(s.pointers_barrados_pelo_gate).toBe(1);
  });
});

describe("deveCederTurnoAMensagem — uma voz só", () => {
  const pedido = { organizationId: ORG, contactId: CONTATO, messageId: MENSAGEM };

  it("cede quando ESTA mensagem já inscreveu o contato", async () => {
    const pool = { query: async () => ({ rows: [{ "?column?": 1 }] }) };
    expect(await deveCederTurnoAMensagem(pool as never, pedido)).toBe(true);
  });

  it("não cede quando nenhum fluxo foi disparado pela mensagem", async () => {
    const pool = { query: async () => ({ rows: [] }) };
    expect(await deveCederTurnoAMensagem(pool as never, pedido)).toBe(false);
  });

  it("consulta que falha não cala o agente (fail-open)", async () => {
    const pool = {
      query: async () => {
        throw new Error("db fora");
      },
    };
    expect(await deveCederTurnoAMensagem(pool as never, pedido)).toBe(false);
  });
});

describe("gatilhoDaEscolha / descreverGatilho — a escolha do diálogo vira gatilho real", () => {
  it("palavra-chave vira inbound_message com as palavras, no modo exato que o diálogo promete", () => {
    const g = gatilhoDaEscolha({ provider: "whatsapp", event: "palavra_chave", keyword: "quero, preço\nextra" });
    expect(g).toEqual({
      kind: "inbound_message",
      params: { match: "keyword", keywords: ["quero", "preço", "extra"], keyword_mode: "equals" },
    });
  });

  it("palavra-chave sem palavra é escolha incompleta", () => {
    expect(gatilhoDaEscolha({ provider: "whatsapp", event: "palavra_chave", keyword: "  " })).toBeNull();
  });

  it("início de conversa e qualquer mensagem mapeiam para o motor", () => {
    expect(gatilhoDaEscolha({ provider: "whatsapp", event: "inicio_conversa", keyword: "" })).toEqual({
      kind: "inbound_message",
      params: { match: "first_message" },
    });
    expect(gatilhoDaEscolha({ provider: "whatsapp", event: "qualquer_mensagem", keyword: "" })).toEqual({
      kind: "inbound_message",
      params: { match: "any" },
    });
  });

  it("outros provedores entram por Webhooks", () => {
    expect(gatilhoDaEscolha({ provider: "kiwify", event: "pagamento_aprovado", keyword: "" })).toEqual({ kind: "webhook" });
  });

  it("o card descreve o gatilho salvo, não o que está no navegador", () => {
    expect(
      descreverGatilho({ kind: "inbound_message", params: { match: "keyword", keywords: ["quero", "preço"] } }),
    ).toEqual({ providerId: "whatsapp", evento: "Enviou palavra-chave", palavras: ["quero", "preço"] });
    expect(descreverGatilho(null).providerId).toBe("manual");
  });
});
