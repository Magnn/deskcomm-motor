/**
 * A PERGUNTA no relógio do fluxo: manda a pergunta, espera a resposta até o prazo e sai por
 * «Respondeu» ou «Sem resposta». Saída NÃO ligada = o lead fica parado ali (`park`) — o funil só
 * avança até onde o dono o montou. Antes a Pergunta era passagem muda no relógio.
 */
import { describe, expect, it, vi } from "vitest";

import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";
import { NO_REPLY_BRANCH_ID, nodeBranches, prazoDaPerguntaMs } from "./graph-schema";
import {
  MAX_ACTION_RECHECKS,
  pisoDoInboundDaEspera,
  processNode,
  textoDaPergunta,
  type EnrollmentRow,
  type LeadFacts,
} from "./node-handlers";
import { avancarSimulacao, iniciarSimulacao } from "./simulate";
import { completeTurnForEnrollment, type TurnBridgeAdminClient } from "./turn-bridge";
import { validateFlowForPublish } from "./validate-publish";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const clock = () => NOW;

function enrollment(over: Partial<EnrollmentRow> = {}): EnrollmentRow {
  return {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "c-1",
    conversation_id: null,
    current_node_id: "p1",
    status: "active",
    next_eval_at: NOW.toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 3,
    outcome: null,
    cancel_reason: null,
    started_at: NOW.toISOString(),
    completed_at: null,
    updated_at: NOW.toISOString(),
    ...over,
  };
}

const lead: LeadFacts = { lead_stage: null, tags: [], steps_taken: 0, last_outcome: null };

function pergunta(config: Record<string, unknown> = {}): FlowNode {
  return {
    id: "p1",
    type: "collect",
    label: "Pergunta",
    position: { x: 0, y: 0 },
    config: { key: "cidade", label: "Em que cidade você mora?", type: "text", required: true, permite_correcao: true, ...config },
  } as FlowNode;
}

const edge = (source: string, target: string, condition: FlowEdge["condition"]): FlowEdge => ({
  id: `${source}->${target}:${JSON.stringify(condition)}`,
  source,
  target,
  priority: 0,
  condition,
});
const always = (): FlowEdge["condition"] => ({ type: "always" });
const semResposta = (): FlowEdge["condition"] => ({ type: "branch", branch_id: NO_REPLY_BRANCH_ID });

const rodar = (node: FlowNode, edges: FlowEdge[], extra: Record<string, unknown> = {}) =>
  processNode({ node, edges, enrollment: enrollment(), lead, clock, ...extra } as Parameters<typeof processNode>[0]);

describe("prazo e saídas da Pergunta", () => {
  it("prazo = tempo × unidade; sem tempo, sem prazo", () => {
    expect(prazoDaPerguntaMs({ expiracao_tempo: 30, expiracao_unidade: "segundos" })).toBe(30_000);
    expect(prazoDaPerguntaMs({ expiracao_tempo: 9 })).toBe(9 * 60_000);
    expect(prazoDaPerguntaMs({ expiracao_tempo: 2, expiracao_unidade: "horas" })).toBe(7_200_000);
    expect(prazoDaPerguntaMs({ expiracao_tempo: 1, expiracao_unidade: "dias" })).toBe(86_400_000);
    expect(prazoDaPerguntaMs({})).toBeNull();
  });

  it("sem prazo, uma saída só (Respondeu); com prazo, ganha «Sem resposta»", () => {
    const sem = nodeBranches({ type: "collect", config: pergunta().config as never });
    expect(sem.map((b) => b.label)).toEqual(["Respondeu"]);
    const com = nodeBranches({ type: "collect", config: pergunta({ expiracao_tempo: 1 }).config as never });
    expect(com.map((b) => b.label)).toEqual(["Sem resposta", "Respondeu"]);
  });
});

describe("processNode — Pergunta", () => {
  const edges = [edge("p1", "ok", always()), edge("p1", "nada", semResposta())];

  it("primeira vez: manda a pergunta e fica esperando a resposta", () => {
    const r = rodar(pergunta({ question: "Qual a sua cidade?" }), edges, { actionEnqueued: false, actionCompleted: false });
    expect(r).toEqual({ kind: "enqueue_turn", purpose: "send_message", wake_status: "waiting_reply", fixed_body: "Qual a sua cidade?" });
  });

  it("sem frase sugerida, pergunta pelo rótulo; múltipla escolha numera as opções", () => {
    const simples = rodar(pergunta(), edges, { actionEnqueued: false, actionCompleted: false });
    expect(simples).toMatchObject({ fixed_body: "Em que cidade você mora?" });
    const escolha = rodar(pergunta({ type: "select", options: ["Sim", "Não"] }), edges, { actionEnqueued: false, actionCompleted: false });
    expect(escolha).toMatchObject({ fixed_body: "Em que cidade você mora?\n\n1. Sim\n2. Não" });
  });

  it("pergunta em voo: confere de novo, e desiste de esperar o envio depois do teto", () => {
    expect(rodar(pergunta(), edges, { actionEnqueued: true, actionCompleted: false, actionRecheckCount: 0 }).kind).toBe("recheck");
    expect(
      rodar(pergunta(), edges, { actionEnqueued: true, actionCompleted: false, actionRecheckCount: MAX_ACTION_RECHECKS }),
    ).toMatchObject({ kind: "dead" });
  });

  it("enviada, ainda sem resposta: espera o prazo configurado", () => {
    const r = rodar(pergunta({ expiracao_tempo: 2, expiracao_unidade: "horas" }), edges, {
      actionEnqueued: true,
      actionCompleted: true,
      waitElapsed: false,
      wokeEarly: false,
    });
    expect(r).toMatchObject({ kind: "wait", wake_status: "waiting_reply" });
    expect((r as { next_eval_at: Date }).next_eval_at.getTime()).toBe(NOW.getTime() + 7_200_000);
  });

  it("respondeu: sai por «Respondeu»", () => {
    const r = rodar(pergunta({ expiracao_tempo: 2 }), edges, {
      actionEnqueued: true,
      actionCompleted: true,
      wokeEarly: true,
      lastInboundBody: "São Paulo",
    });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "ok" });
  });

  it("prazo venceu sem resposta: sai por «Sem resposta»", () => {
    const r = rodar(pergunta({ expiracao_tempo: 2 }), edges, { actionEnqueued: true, actionCompleted: true, waitElapsed: true, wokeEarly: false });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "nada" });
  });

  it("«Respondeu» NÃO ligada: o lead fica parado (não é erro) e não fica mais esperando", () => {
    const r = rodar(pergunta({ expiracao_tempo: 2 }), [edge("p1", "nada", semResposta())], {
      actionEnqueued: true,
      actionCompleted: true,
      wokeEarly: true,
      lastInboundBody: "São Paulo",
    });
    expect(r).toMatchObject({ kind: "park" });
  });

  it("«Sem resposta» NÃO ligada: o lead fica parado — e NÃO escorrega para «Respondeu»", () => {
    const r = rodar(pergunta({ expiracao_tempo: 2 }), [edge("p1", "ok", always())], {
      actionEnqueued: true,
      actionCompleted: true,
      waitElapsed: true,
      wokeEarly: false,
    });
    expect(r).toMatchObject({ kind: "park", aguardando_resposta: true });
    expect((r as { reason: string }).reason).toContain("Sem resposta");
  });

  it("sem prazo e sem resposta depois de 30 dias: fica parado, ainda ouvindo", () => {
    const r = rodar(pergunta(), [edge("p1", "ok", always())], { actionEnqueued: true, actionCompleted: true, waitElapsed: true, wokeEarly: false });
    expect(r).toMatchObject({ kind: "park", aguardando_resposta: true });
  });

  it("sem prazo, a espera é de 30 dias (não some nem dispara no mesmo tick)", () => {
    const r = rodar(pergunta(), [edge("p1", "ok", always())], { actionEnqueued: true, actionCompleted: true, waitElapsed: false, wokeEarly: false });
    expect((r as { next_eval_at: Date }).next_eval_at.getTime()).toBe(NOW.getTime() + 30 * 86_400_000);
  });

  it("nenhuma saída ligada e ainda esperando: espera normalmente (só para quando a saída é tomada)", () => {
    const r = rodar(pergunta({ expiracao_tempo: 1 }), [], { actionEnqueued: true, actionCompleted: true, waitElapsed: false, wokeEarly: false });
    expect(r.kind).toBe("wait");
  });
});

// A tela promete: "apenas um espaço no campo «Faça uma pergunta» … nenhum texto será enviado".
// Em produção (03/out) o rótulo interno «Nova pergunta» saía para cada lead do funil.
describe("processNode — Pergunta em branco é PAUSA (nada sai para o lead)", () => {
  const edges = [edge("p1", "ok", always()), edge("p1", "nada", semResposta())];
  const pausa = (extra: Record<string, unknown> = {}) =>
    pergunta({ label: "Nova pergunta", question: " ", expiracao_tempo: 9, ...extra });

  it("o rótulo não é texto da pergunta: com «question» só de espaço, nada é enfileirado", () => {
    // 1ª entrada como o engine a monta: sem evento anterior no nó (waitElapsed=false ⇒ actionEnqueued=false).
    const r = rodar(pausa(), edges, { actionEnqueued: false, actionCompleted: false, waitElapsed: false, wokeEarly: false });
    expect(r).toMatchObject({ kind: "wait", wake_status: "waiting_reply" });
    expect((r as { next_eval_at: Date }).next_eval_at.getTime()).toBe(NOW.getTime() + 9 * 60_000);
    expect(JSON.stringify(r)).not.toContain("Nova pergunta");
  });

  it("vazio também é pausa", () => {
    expect(rodar(pausa({ question: "" }), edges, { actionEnqueued: false, actionCompleted: false }).kind).toBe("wait");
  });

  it("respondeu durante a pausa: sai por «Respondeu» (sem esperar um envio que nunca vai existir)", () => {
    const r = rodar(pausa(), edges, { actionEnqueued: true, actionCompleted: false, wokeEarly: true, lastInboundBody: "combinado" });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "ok" });
  });

  it("prazo da pausa venceu: sai por «Sem resposta» — nunca recheck nem dead-man de envio", () => {
    const r = rodar(pausa(), edges, {
      actionEnqueued: true,
      actionCompleted: false,
      actionRecheckCount: MAX_ACTION_RECHECKS,
      waitElapsed: true,
      wokeEarly: false,
    });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "nada" });
  });

  it("múltipla escolha em branco ainda manda as opções (sem elas não há o que escolher)", () => {
    const r = rodar(pausa({ type: "select", options: ["Sim", "Não"] }), edges, { actionEnqueued: false, actionCompleted: false });
    expect(r).toMatchObject({ kind: "enqueue_turn", fixed_body: "Nova pergunta\n\n1. Sim\n2. Não" });
  });

  it("caixa antiga sem «question» continua perguntando pelo rótulo", () => {
    expect(textoDaPergunta(pergunta().config as never)).toBe("Em que cidade você mora?");
    expect(textoDaPergunta(pausa().config as never)).toBeNull();
  });

  it("o piso da resposta da pausa é o início da espera (wait_started), não o updated_at da inscrição", () => {
    const inicio = new Date(NOW.getTime() - 60_000);
    const fim = new Date(inicio.getTime() + 9 * 60_000).toISOString();
    const piso = pisoDoInboundDaEspera(
      pausa() as Extract<FlowNode, { type: "collect" }>,
      [{ node_id: "p1", idempotency_key: "p1:3", event_type: "wait_started", payload: { next_eval_at: fim } }],
      NOW.toISOString(),
    );
    expect(piso).toBe(inicio.toISOString());
  });
});

// ─── publicação ──────────────────────────────────────────────────────────────

function grafo(nodes: FlowNode[], edges: FlowEdge[]): FlowGraph {
  return { nodes, edges } as FlowGraph;
}
const gatilho = { id: "t", type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} } as FlowNode;
const fim = { id: "f", type: "end", label: "Fim", position: { x: 0, y: 0 }, config: { outcome: "exhausted" } } as FlowNode;
const codigos = (g: FlowGraph): string[] => {
  const r = validateFlowForPublish(g, { surface: "followup" });
  return r.ok ? [] : r.errors.map((e) => e.code);
};

describe("publicação do fluxo com Pergunta", () => {
  it("a Pergunta é aceita no fluxo do relógio", () => {
    const g = grafo([gatilho, pergunta({ expiracao_tempo: 1 }), fim], [edge("t", "p1", always()), edge("p1", "f", always())]);
    expect(codigos(g)).not.toContain("no_fora_da_superficie");
  });

  it("as duas saídas soltas PUBLICAM: o lead fica parado, sem exigir Fim nem ligação", () => {
    const g = grafo([gatilho, pergunta({ expiracao_tempo: 1 }), fim], [edge("t", "p1", always())]);
    const c = codigos(g);
    expect(c).not.toContain("missing_branch_edge");
    expect(c).not.toContain("missing_always_fallback");
    expect(c).not.toContain("no_end_path");
  });

  it("um nó antes da Pergunta também não é acusado de «sem caminho até o fim»", () => {
    const espera = { id: "w", type: "wait", label: "Espera", position: { x: 0, y: 0 }, config: { mode: "fixed", duration_ms: 600_000 } } as FlowNode;
    const g = grafo([gatilho, espera, pergunta(), fim], [edge("t", "w", always()), edge("w", "p1", always())]);
    expect(codigos(g)).not.toContain("no_end_path");
  });
});

// ─── ponte: a pergunta saiu ──────────────────────────────────────────────────

function fakeDb(graph: FlowGraph, enr: EnrollmentRow) {
  const updateEnrollment = vi.fn(async () => {});
  const insertEnrollmentEvent = vi.fn(async () => ({ inserted: true }));
  const db: TurnBridgeAdminClient = {
    claimDueEnrollments: async () => [],
    loadEnrollmentById: async () => enr,
    loadFlowGraph: async () => graph,
    loadLeadFacts: async () => ({ lead_stage: null, tags: [] }),
    loadLastInboundBody: async () => null,
    loadEnrollmentEvents: async () => [],
    insertEnrollmentEvent,
    updateEnrollment,
    loadFlowPointerName: async () => null,
    insertDeadInboxItem: async () => {},
    persistirRespostaFollowup: async () => {},
  };
  return { db, updateEnrollment, insertEnrollmentEvent };
}

describe("completeTurnForEnrollment — a pergunta saiu", () => {
  it("fica no nó, espera o PRAZO e grava collect_sent", async () => {
    const g = grafo([gatilho, pergunta({ expiracao_tempo: 3, expiracao_unidade: "horas" }), fim], [edge("t", "p1", always()), edge("p1", "f", always())]);
    const { db, updateEnrollment, insertEnrollmentEvent } = fakeDb(g, enrollment());
    await completeTurnForEnrollment(db, "org-1", "enr-1", "p1", { kind: "sent" }, clock);
    expect(insertEnrollmentEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "collect_sent", node_id: "p1" }));
    expect(updateEnrollment).toHaveBeenCalledWith(
      "enr-1",
      "org-1",
      expect.objectContaining({
        current_node_id: "p1",
        status: "waiting_reply",
        next_eval_at: new Date(NOW.getTime() + 3 * 3_600_000).toISOString(),
      }),
    );
  });

  it("sem prazo, espera 30 dias", async () => {
    const g = grafo([gatilho, pergunta(), fim], [edge("t", "p1", always())]);
    const { db, updateEnrollment } = fakeDb(g, enrollment());
    await completeTurnForEnrollment(db, "org-1", "enr-1", "p1", { kind: "sent" }, clock);
    expect(updateEnrollment).toHaveBeenCalledWith(
      "enr-1",
      "org-1",
      expect.objectContaining({ next_eval_at: new Date(NOW.getTime() + 30 * 86_400_000).toISOString() }),
    );
  });
});

// ─── simulador ───────────────────────────────────────────────────────────────

describe("simulador — Pergunta", () => {
  const g = grafo(
    [gatilho, pergunta({ expiracao_tempo: 1 }), { ...fim, id: "ok" } as FlowNode],
    [edge("t", "p1", always()), edge("p1", "ok", always())],
  );
  const classificar = async () => "x";

  async function ateAPergunta() {
    const ini = iniciarSimulacao(g);
    if (!ini.ok) throw new Error("ini");
    return avancarSimulacao({ graph: g, state: ini.state, classificar });
  }

  it("mostra a pergunta e espera; a resposta leva por «Respondeu»", async () => {
    const parado = await ateAPergunta();
    expect(parado.aguardando).toBe("collect");
    expect(parado.transcript.some((t) => t.kind === "mensagem_simulada" && t.origem === "pergunta")).toBe(true);
    const dep = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "mensagem", texto: "São Paulo" }, classificar });
    expect(dep.status).toBe("concluido");
    expect(dep.transcript.some((t) => t.kind === "fim")).toBe(true);
  });

  it("«sem resposta» com a saída solta PARA o lead (parado), sem erro", async () => {
    const parado = await ateAPergunta();
    const dep = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "sem_resposta" }, classificar });
    expect(dep.status).toBe("concluido");
    expect(dep.transcript.at(-1)).toMatchObject({ kind: "parado", nodeId: "p1" });
    expect(dep.transcript.some((t) => t.kind === "erro")).toBe(false);
  });
});
