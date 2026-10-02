/**
 * SAÍDA NÃO LIGADA DEIXA O LEAD PARADO — em TODOS os nós.
 *
 * A regra do dono: cada nó tem as suas linhas de saída; se ele não liga uma e o lead sai por ela, o lead
 * FICA no nó — o funil só avança até onde foi estruturado. Antes: `fail` (backoff e depois `dead`, com
 * alarme) ou, pior, o motor escorregava para a saída de escape («Outros casos») / para a PRIMEIRA regra,
 * mandando o lead por um caminho que a decisão não tomou.
 *
 * Esta suíte é também a AUDITORIA da lógica de cada nó: para cada decisão, o que sai pela aresta certa, o
 * que cai no escape só quando ele É a decisão, e o que para.
 */
import { describe, expect, it, vi } from "vitest";

import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";
import {
  REPEAT_BODY_BRANCH_ID,
  REPEAT_DONE_BRANCH_ID,
  NO_REPLY_BRANCH_ID,
} from "./graph-schema";
import {
  arestaDaClasse,
  avisoDeNotificarAtendente,
  chamadaDeApiDoFluxo,
  escolherRamoDoSplit,
  executou,
  notaDeFluxo,
  processNode,
  selectEdge,
  selectEdgeExata,
  type EnrollmentRow,
  type LeadFacts,
  type NodeResult,
} from "./node-handlers";
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
    conversation_id: "conv-1",
    current_node_id: "n",
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

const lead = (over: Partial<LeadFacts> = {}): LeadFacts => ({ lead_stage: null, tags: [], steps_taken: 0, last_outcome: null, ...over });

const no = (id: string, type: FlowNode["type"], config: Record<string, unknown>): FlowNode =>
  ({ id, type, label: id, position: { x: 0, y: 0 }, config }) as FlowNode;

const edge = (source: string, target: string, condition: FlowEdge["condition"]): FlowEdge => ({
  id: `${source}->${target}:${JSON.stringify(condition)}`,
  source,
  target,
  priority: 0,
  condition,
});
const always = (): FlowEdge["condition"] => ({ type: "always" });
const ramo = (id: string): FlowEdge["condition"] => ({ type: "branch", branch_id: id });

const rodar = (node: FlowNode, edges: FlowEdge[], extra: Record<string, unknown> = {}): NodeResult =>
  processNode({ node, edges, enrollment: enrollment({ current_node_id: node.id }), lead: lead(), clock, ...extra } as Parameters<typeof processNode>[0]);

const ehPark = (r: NodeResult) => r.kind === "park";

// ─── A regra base ────────────────────────────────────────────────────────────

describe("selectEdgeExata — sem o escape para «always»", () => {
  const edges = [edge("n", "a", always()), edge("n", "b", ramo("x"))];

  it("acha só a condição pedida", () => {
    expect(selectEdgeExata(edges, "n", ramo("x"))?.target).toBe("b");
    expect(selectEdgeExata(edges, "n", always())?.target).toBe("a");
  });

  it("ramo sem aresta NÃO cai em «always» (selectEdge cairia)", () => {
    expect(selectEdgeExata(edges, "n", ramo("y"))).toBeNull();
    expect(selectEdge(edges, "n", ramo("y"))?.target).toBe("a"); // o escape antigo, para contraste
  });
});

// ─── Nós de saída única: sem saída, parados (nenhum vira erro) ───────────────

const DE_SAIDA_UNICA: Array<[string, FlowNode, Record<string, unknown>]> = [
  ["trigger", no("n", "trigger", {}), {}],
  ["wait (fixa, já esperou)", no("n", "wait", { mode: "fixed", duration_ms: 300_000 }), { waitElapsed: true }],
  ["wait (cortada por resposta)", no("n", "wait", { mode: "fixed", duration_ms: 300_000 }), { wokeEarly: true }],
  ["skill", no("n", "skill", { skill_name: "x" }), {}],
  ["action (envio fechado)", no("n", "action", { mode: "text", body: "oi" }), { actionCompleted: true }],
  ["ai_generic (turno fechado)", no("n", "ai_generic", { prompt: "p", save_to: { kind: "lead_custom", key: "r" } }), { actionCompleted: true }],
  ["api_call", no("n", "api_call", { method: "GET", url: "https://a.com", headers: [] }), {}],
  ["notify_agent", no("n", "notify_agent", { message: "m" }), {}],
  ["add_note", no("n", "add_note", { body: "b" }), {}],
];

describe("nós de saída única sem ligação: o lead PARA, nunca falha", () => {
  for (const [nome, node, extra] of DE_SAIDA_UNICA) {
    it(nome, () => {
      const r = rodar(node, [], extra);
      expect(r.kind).toBe("park");
      expect((r as { reason: string }).reason).toMatch(/não está ligad/);
    });
  }

  it("com a saída ligada, continuam avançando (a regra não muda o caminho normal)", () => {
    for (const [, node, extra] of DE_SAIDA_UNICA) {
      const r = rodar(node, [edge("n", "prox", always())], extra);
      expect(r).toMatchObject({ kind: "advance", next_node_id: "prox" });
    }
  });

  it("os que EXECUTAM algo marcam `concluiu` — o efeito não se perde por falta de saída", () => {
    const efeito = ["skill", "action (envio fechado)", "ai_generic (turno fechado)", "api_call", "notify_agent", "add_note"];
    for (const [nome, node, extra] of DE_SAIDA_UNICA) {
      const r = rodar(node, [], extra) as { concluiu?: boolean };
      expect(Boolean(r.concluiu), nome).toBe(efeito.includes(nome));
    }
  });
});

describe("efeitos colaterais rodam MESMO quando o nó termina parado", () => {
  const enr = enrollment();

  it("notificar atendente avisa", () => {
    const node = no("n", "notify_agent", { message: "olhem o lead" });
    const r = rodar(node, []);
    expect(executou(r)).toBe(true);
    expect(avisoDeNotificarAtendente(enr, node, r)).toMatchObject({ body: "olhem o lead" });
  });

  it("anotação é gravada", () => {
    const node = no("n", "add_note", { body: "ligou pedindo preço" });
    const r = rodar(node, []);
    expect(notaDeFluxo(enr, node, r)).toMatchObject({ body: "ligou pedindo preço" });
  });

  it("a chamada de API é feita", () => {
    const node = no("n", "api_call", { method: "POST", url: "https://a.com/x", headers: [] });
    const r = rodar(node, []);
    expect(chamadaDeApiDoFluxo(node, r)).toMatchObject({ method: "POST", url: "https://a.com/x" });
  });

  it("um nó que só PAROU (sem ter feito nada) não dispara efeito", () => {
    const node = no("n", "notify_agent", { message: "m" });
    expect(avisoDeNotificarAtendente(enr, node, { kind: "park", reason: "x" })).toBeNull();
  });
});

// ─── Condição ────────────────────────────────────────────────────────────────

describe("condição", () => {
  const VIP = { id: "chk_vip", field: "tag", op: "contains", value: "vip" };
  const FRIO = { id: "chk_frio", field: "steps_taken", op: "gte", value: 3 };
  const perCheck = no("n", "condition", { combinator: "and", branching: "per_check", checks: [VIP, FRIO] });

  it("regra que serviu leva pela aresta DELA", () => {
    const r = rodar(perCheck, [edge("n", "vip", ramo("chk_vip")), edge("n", "outros", always())], { lead: lead({ tags: ["vip"] }) });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "vip" });
  });

  it("a PRIMEIRA regra que serve manda, pela ordem da lista", () => {
    const r = rodar(perCheck, [edge("n", "vip", ramo("chk_vip")), edge("n", "frio", ramo("chk_frio"))], {
      lead: lead({ tags: ["vip"], steps_taken: 9 }),
    });
    expect(r).toMatchObject({ next_node_id: "vip" });
  });

  it("regra que serviu COM A SAÍDA SOLTA: fica parado — não escorrega para «Nenhuma delas»", () => {
    const r = rodar(perCheck, [edge("n", "outros", always())], { lead: lead({ tags: ["vip"] }) });
    expect(r.kind).toBe("park");
    expect((r as { reason: string }).reason).toMatch(/^a saída «/);
  });

  it("nenhuma regra serviu: «Nenhuma delas» (always) é a decisão", () => {
    const r = rodar(perCheck, [edge("n", "vip", ramo("chk_vip")), edge("n", "outros", always())], { lead: lead() });
    expect(r).toMatchObject({ kind: "advance", next_node_id: "outros" });
  });

  it("nenhuma regra serviu e «Nenhuma delas» solta: fica parado", () => {
    const r = rodar(perCheck, [edge("n", "vip", ramo("chk_vip"))], { lead: lead() });
    expect(r.kind).toBe("park");
    expect((r as { reason: string }).reason).toContain("Nenhuma delas");
  });

  const simples = no("n", "condition", { combinator: "and", checks: [{ field: "tag", op: "contains", value: "vip" }] });
  const condResult = (value: boolean): FlowEdge["condition"] => ({ type: "cond_result", value });

  it("combinado: Sim e Não levam pelas suas arestas", () => {
    const edges = [edge("n", "sim", condResult(true)), edge("n", "nao", condResult(false))];
    expect(rodar(simples, edges, { lead: lead({ tags: ["vip"] }) })).toMatchObject({ next_node_id: "sim" });
    expect(rodar(simples, edges, { lead: lead() })).toMatchObject({ next_node_id: "nao" });
  });

  it("combinado: a saída do resultado solta PARA — sem cair em «always»", () => {
    const r = rodar(simples, [edge("n", "sim", condResult(true)), edge("n", "escape", always())], { lead: lead() });
    expect(r.kind).toBe("park");
    expect((r as { reason: string }).reason).toContain("Não");
  });

  it("negação com dado desconhecido NÃO serve (ausência não prova a negativa)", () => {
    const neq = no("n", "condition", { combinator: "and", checks: [{ field: "last_outcome", op: "neq", value: "hot" }] });
    const r = rodar(neq, [edge("n", "sim", condResult(true)), edge("n", "nao", condResult(false))], { lead: lead({ last_outcome: null }) });
    expect(r).toMatchObject({ next_node_id: "nao" });
  });
});

// ─── Teste A/B ───────────────────────────────────────────────────────────────

describe("teste A/B", () => {
  const split = no("n", "ab_split", { branches: [{ id: "a", label: "A", percent: 50 }, { id: "b", label: "B", percent: 50 }] });
  const escolhido = escolherRamoDoSplit(split.config as never, "enr-1:n");
  const outro = escolhido === "a" ? "b" : "a";

  it("o braço sorteado leva pela aresta dele — e é o MESMO a cada reavaliação (não redivide o tráfego)", () => {
    const edges = [edge("n", "via-a", ramo("a")), edge("n", "via-b", ramo("b"))];
    const r1 = rodar(split, edges);
    const r2 = rodar(split, edges);
    expect(r1).toEqual(r2);
    expect(r1).toMatchObject({ next_node_id: `via-${escolhido}` });
  });

  it("a divisão respeita os percentuais (10.000 inscrições, 70/30)", () => {
    const cfg = { branches: [{ id: "a", label: "A", percent: 70 }, { id: "b", label: "B", percent: 30 }] } as never;
    let a = 0;
    for (let i = 0; i < 10_000; i++) if (escolherRamoDoSplit(cfg, `enr-${i}:sp`) === "a") a++;
    expect(a / 10_000).toBeGreaterThan(0.67);
    expect(a / 10_000).toBeLessThan(0.73);
  });

  it("braço sorteado SOLTO: o lead fica — a fatia dele NÃO vai para «Outros casos»", () => {
    const r = rodar(split, [edge("n", `via-${outro}`, ramo(outro)), edge("n", "escape", always())]);
    expect(r.kind).toBe("park");
  });
});

// ─── Esperar resposta: classificar / regra de texto / menu ───────────────────

describe("classificar (IA)", () => {
  const classify = no("n", "ai_classify", { classes: ["quente", "frio"], grace_timeout_ms: 900_000, target: "last_reply" });

  it("prazo vencido sem classificação: «Sem resposta» é a decisão", () => {
    const edges = [edge("n", "sr", { type: "class_match", value: NO_REPLY_BRANCH_ID }), edge("n", "escape", always())];
    expect(rodar(classify, edges, { waitElapsed: true })).toMatchObject({ kind: "advance", next_node_id: "sr" });
  });

  it("«Sem resposta» solta: fica parado — NÃO vai para «Outros casos»", () => {
    const r = rodar(classify, [edge("n", "quente", { type: "class_match", value: "quente" }), edge("n", "escape", always())], { waitElapsed: true });
    expect(r.kind).toBe("park");
  });

  it("classe DECLARADA solta: parado; classe FORA das declaradas: «Outros casos» (a única vez em que o escape é a decisão)", () => {
    const soEscape = [edge("n", "escape", always())];
    const declarada = arestaDaClasse(classify as never, soEscape, "quente");
    expect(declarada).toEqual({ edge: null, declarada: true });
    const fora = arestaDaClasse(classify as never, soEscape, "morno");
    expect(fora.declarada).toBe(false);
    expect(fora.edge?.target).toBe("escape");
  });
});

describe("resposta (texto)", () => {
  const regras = no("n", "match_reply", {
    branches: [
      { id: "br_sim", label: "Sim", op: "eq", pattern: "sim" },
      { id: "br_nao", label: "Não", op: "contains", pattern: "nao" },
    ],
    grace_timeout_ms: 900_000,
  });
  const respondeu = (texto: string) => ({ waitElapsed: true, wokeEarly: true, lastInboundBody: texto });

  it("a regra que casou leva pela aresta dela; ninguém casou → «Outros casos»", () => {
    const edges = [edge("n", "sim", ramo("br_sim")), edge("n", "outros", always())];
    expect(rodar(regras, edges, respondeu("sim"))).toMatchObject({ next_node_id: "sim" });
    expect(rodar(regras, edges, respondeu("talvez"))).toMatchObject({ next_node_id: "outros" });
  });

  it("igual (eq) não casa parcial; contém (contains) casa parcial", () => {
    const edges = [edge("n", "sim", ramo("br_sim")), edge("n", "nao", ramo("br_nao")), edge("n", "outros", always())];
    expect(rodar(regras, edges, respondeu("sim, claro"))).toMatchObject({ next_node_id: "outros" });
    expect(rodar(regras, edges, respondeu("acho que nao quero"))).toMatchObject({ next_node_id: "nao" });
  });

  it("UMA saída de resposta ligada: QUALQUER resposta avança por ela — só o silêncio para", () => {
    // Medido em produção, e decisão do dono: a regra dizia "sim", o lead escreveu "ok", e o funil
    // tem de seguir. Com uma saída só não há caminho a escolher errado.
    const soSim = [edge("n", "sim", ramo("br_sim"))];
    expect(rodar(regras, soSim, respondeu("ok"))).toMatchObject({ kind: "advance", next_node_id: "sim" });
    expect(rodar(regras, soSim, respondeu("talvez"))).toMatchObject({ kind: "advance", next_node_id: "sim" });
    // «Sem resposta» ligada NÃO conta como saída de resposta: ela é o caminho do silêncio.
    const simESilencio = [edge("n", "sim", ramo("br_sim")), edge("n", "sr", ramo(NO_REPLY_BRANCH_ID))];
    expect(rodar(regras, simESilencio, respondeu("ok"))).toMatchObject({ kind: "advance", next_node_id: "sim" });
  });

  it("…e o silêncio NÃO avança por ela: sem resposta no prazo sai por «Sem resposta», ou termina ali", () => {
    const soSim = [edge("n", "sim", ramo("br_sim"))];
    expect(rodar(regras, soSim, { waitElapsed: true }).kind).toBe("park");
    const simESilencio = [edge("n", "sim", ramo("br_sim")), edge("n", "sr", ramo(NO_REPLY_BRANCH_ID))];
    expect(rodar(regras, simESilencio, { waitElapsed: true })).toMatchObject({ next_node_id: "sr" });
  });

  it("VÁRIAS saídas ligadas e nenhuma casou, «Outros casos» solta: a pergunta CONTINUA ABERTA — não vai para a PRIMEIRA regra (defeito antigo)", () => {
    const duas = [edge("n", "sim", ramo("br_sim")), edge("n", "nao", ramo("br_nao"))];
    const r = rodar(regras, duas, respondeu("talvez"));
    expect(r).toMatchObject({ kind: "wait", wake_status: "waiting_reply" });
    // A espera recomeça do zero (a graça inteira): é o que tira ESTA mensagem do alcance da próxima leitura.
    expect((r as { next_eval_at: Date }).next_eval_at).toBeInstanceOf(Date);
  });

  it("…e a resposta que casa segue pela regra dela", () => {
    const duas = [edge("n", "sim", ramo("br_sim")), edge("n", "nao", ramo("br_nao"))];
    expect(rodar(regras, duas, respondeu("sim"))).toMatchObject({ next_node_id: "sim" });
    expect(rodar(regras, duas, respondeu("acho que nao"))).toMatchObject({ next_node_id: "nao" });
  });

  it("regra que casou com a saída solta: parado", () => {
    const r = rodar(regras, [edge("n", "outros", always())], respondeu("sim"));
    expect(r.kind).toBe("park");
    expect((r as { reason: string }).reason).toContain("Sim");
  });

  it("sem resposta no prazo: «Sem resposta»; solta → parado, nunca «Outros casos»", () => {
    const ligada = rodar(regras, [edge("n", "sr", ramo(NO_REPLY_BRANCH_ID)), edge("n", "outros", always())], { waitElapsed: true });
    expect(ligada).toMatchObject({ next_node_id: "sr" });
    const solta = rodar(regras, [edge("n", "outros", always())], { waitElapsed: true });
    expect(solta.kind).toBe("park");
  });

  it("guardando a resposta (save_to): qualquer resposta segue por «Outros casos»; solta → parado", () => {
    const comCampo = no("n", "match_reply", {
      branches: [{ id: "br_x", label: "X", op: "contains", pattern: "x" }],
      grace_timeout_ms: 900_000,
      save_to: { kind: "contact_name" },
    });
    expect(rodar(comCampo, [edge("n", "segue", always())], respondeu("Ian"))).toMatchObject({ next_node_id: "segue" });
    expect(rodar(comCampo, [edge("n", "x", ramo("br_x"))], respondeu("Ian")).kind).toBe("park");
  });
});

describe("menu", () => {
  const menu = no("n", "menu", {
    prompt: "Como ajudo?",
    options: [{ id: "o1", label: "Comprar" }, { id: "o2", label: "Suporte" }],
    grace_timeout_ms: 900_000,
  });
  const respondeu = (texto: string) => ({ actionEnqueued: true, actionCompleted: true, wokeEarly: true, lastInboundBody: texto });

  it("a opção (por número ou nome, sem caixa) leva pela aresta dela", () => {
    const edges = [edge("n", "comprar", ramo("o1")), edge("n", "suporte", ramo("o2")), edge("n", "outros", always())];
    expect(rodar(menu, edges, respondeu("1"))).toMatchObject({ next_node_id: "comprar" });
    expect(rodar(menu, edges, respondeu("2)"))).toMatchObject({ next_node_id: "suporte" });
    expect(rodar(menu, edges, respondeu("SUPORTE"))).toMatchObject({ next_node_id: "suporte" });
  });

  it("resposta que não é nenhuma opção: «Outros casos»; solta → parado", () => {
    expect(rodar(menu, [edge("n", "outros", always())], respondeu("banana"))).toMatchObject({ next_node_id: "outros" });
    expect(rodar(menu, [edge("n", "comprar", ramo("o1"))], respondeu("banana")).kind).toBe("park");
  });

  it("número fora da lista (ex.: 7) não é opção", () => {
    expect(rodar(menu, [edge("n", "outros", always()), edge("n", "comprar", ramo("o1"))], respondeu("7"))).toMatchObject({ next_node_id: "outros" });
  });

  it("opção escolhida com a saída solta: parado — não cai em «Outros casos»", () => {
    const r = rodar(menu, [edge("n", "outros", always())], respondeu("1"));
    expect(r.kind).toBe("park");
    expect((r as { reason: string }).reason).toContain("Comprar");
  });

  it("sem resposta: «Sem resposta»; solta → parado", () => {
    const p = { actionEnqueued: true, actionCompleted: true, waitElapsed: true };
    expect(rodar(menu, [edge("n", "sr", ramo(NO_REPLY_BRANCH_ID))], p)).toMatchObject({ next_node_id: "sr" });
    expect(rodar(menu, [edge("n", "outros", always())], p).kind).toBe("park");
  });
});

// ─── Distribuição, repetir, agente ───────────────────────────────────────────

describe("distribuir para atendente", () => {
  const rota = no("n", "attendant_route", { max_wait_minutes: 30 });

  it("atribuído → «Atendido por uma pessoa»; solta → parado", () => {
    expect(rodar(rota, [edge("n", "ok", ramo("assigned"))], { attendantAssigned: true })).toMatchObject({ next_node_id: "ok" });
    expect(rodar(rota, [edge("n", "escape", always())], { attendantAssigned: true }).kind).toBe("park");
  });

  it("prazo esgotado sem atendente → «Sem atendente no prazo»; solta → parado (não escapa)", () => {
    const vencido = { attendantAssigned: false, attendantDeadlineAt: new Date(NOW.getTime() - 1) };
    expect(rodar(rota, [edge("n", "t", ramo("timeout"))], vencido)).toMatchObject({ next_node_id: "t" });
    expect(rodar(rota, [edge("n", "escape", always())], vencido).kind).toBe("park");
  });

  it("dentro do prazo e sem atendente: continua esperando (não para)", () => {
    const r = rodar(rota, [], { attendantAssigned: false, attendantDeadlineAt: new Date(NOW.getTime() + 600_000) });
    expect(r.kind).toBe("wait");
  });
});

describe("repetir", () => {
  const repetir = no("n", "repeat", { max_count: 5 });

  it("body enquanto há voltas; done quando acabam", () => {
    const edges = [edge("n", "corpo", ramo(REPEAT_BODY_BRANCH_ID)), edge("n", "fim", ramo(REPEAT_DONE_BRANCH_ID)), edge("n", "escape", always())];
    expect(rodar(repetir, edges, { repeatTaken: 0, repeatTotal: 3 })).toMatchObject({ next_node_id: "corpo" });
    expect(rodar(repetir, edges, { repeatTaken: 3, repeatTotal: 3 })).toMatchObject({ next_node_id: "fim" });
  });

  it("body solto ou done solto: parado — nunca pelo escape", () => {
    expect(rodar(repetir, [edge("n", "fim", ramo(REPEAT_DONE_BRANCH_ID)), edge("n", "escape", always())], { repeatTaken: 0, repeatTotal: 3 }).kind).toBe("park");
    expect(rodar(repetir, [edge("n", "corpo", ramo(REPEAT_BODY_BRANCH_ID)), edge("n", "escape", always())], { repeatTaken: 3, repeatTotal: 3 }).kind).toBe("park");
  });

  it("contagem ilegível segue pelo escape (é a decisão); escape solto → parado", () => {
    const p = { repeatTaken: 0, repeatTotal: null, lastInboundBody: "tanto faz" };
    expect(rodar(repetir, [edge("n", "escape", always())], p)).toMatchObject({ next_node_id: "escape" });
    expect(rodar(repetir, [edge("n", "corpo", ramo(REPEAT_BODY_BRANCH_ID))], p).kind).toBe("park");
  });
});

describe("agente de IA", () => {
  const agente = no("n", "agent", { agent_id: "11111111-1111-4111-8111-111111111111", objetivo: "x", max_turnos: 5, silencio_minutos: 15 });

  it("silêncio → saída «Silêncio»; solta → parado (a conversa segue com o agente)", () => {
    const com = enrollment({ current_node_id: "n", status: "com_agente" });
    const r1 = processNode({ node: agente, edges: [edge("n", "s", ramo("silencio"))], enrollment: com, lead: lead(), clock });
    expect(r1).toMatchObject({ next_node_id: "s" });
    const r2 = processNode({ node: agente, edges: [edge("n", "escape", always())], enrollment: com, lead: lead(), clock });
    expect(r2.kind).toBe("park");
  });
});

describe("fim do fluxo", () => {
  it("o Fim conclui — não tem saída e não para", () => {
    expect(rodar(no("n", "end", { outcome: "converted" }), [])).toMatchObject({ kind: "complete", outcome: "converted" });
  });
});

// ─── A ponte: o resultado chegou e a saída não está ligada ───────────────────

function ponte(graph: FlowGraph, enr: EnrollmentRow) {
  const updateEnrollment = vi.fn(async () => {});
  const insertEnrollmentEvent = vi.fn(async () => ({ inserted: true }));
  const persistir = vi.fn(async () => {});
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
    persistirRespostaFollowup: persistir,
  };
  return { db, updateEnrollment, insertEnrollmentEvent, persistir };
}
const grafo = (nodes: FlowNode[], edges: FlowEdge[]): FlowGraph => ({ nodes, edges }) as FlowGraph;
const trigger = no("t", "trigger", {});

describe("ponte — resultado chega e a saída não está ligada: o lead fica, sem lançar", () => {
  it("mensagem enviada (action) sem saída: fica parado; não lança (lançar reenviaria a mensagem)", async () => {
    const g = grafo([trigger, no("a", "action", { mode: "text", body: "oi" })], [edge("t", "a", always())]);
    const { db, updateEnrollment, insertEnrollmentEvent } = ponte(g, enrollment({ current_node_id: "a" }));
    await expect(completeTurnForEnrollment(db, "org-1", "enr-1", "a", { kind: "sent" }, clock)).resolves.toBeUndefined();
    expect(insertEnrollmentEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "node_parked" }));
    expect(updateEnrollment).toHaveBeenCalledWith("enr-1", "org-1", expect.objectContaining({ current_node_id: "a", status: "completed", outcome: "exhausted", next_eval_at: null }));
    // O estado que se gravava antes (`active` sem relógio) o banco recusa — ver `park` em engine.ts.
    expect(updateEnrollment).not.toHaveBeenCalledWith("enr-1", "org-1", expect.objectContaining({ status: "active", next_eval_at: null }));
  });

  it("classe DECLARADA sem aresta: parado; classe fora das declaradas: «Outros casos»", async () => {
    const classify = no("c", "ai_classify", { classes: ["quente", "frio"], grace_timeout_ms: 900_000, target: "last_reply" });
    const g = grafo([trigger, classify, no("e", "end", { outcome: "exhausted" })], [
      edge("t", "c", always()),
      edge("c", "e", { type: "class_match", value: "frio" }),
      edge("c", "e", always()),
    ]);
    const a = ponte(g, enrollment({ current_node_id: "c", status: "waiting_reply" }));
    await completeTurnForEnrollment(a.db, "org-1", "enr-1", "c", { kind: "classified", class: "quente" }, clock);
    expect(a.insertEnrollmentEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "node_parked" }));

    const b = ponte(g, enrollment({ current_node_id: "c", status: "waiting_reply" }));
    await completeTurnForEnrollment(b.db, "org-1", "enr-1", "c", { kind: "classified", class: "morno" }, clock);
    expect(b.insertEnrollmentEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "ai_classified" }));
  });

  it("IA (nó GPT) sem saída: o campo AINDA é gravado, e só então o lead fica", async () => {
    const g = grafo([trigger, no("g", "ai_generic", { prompt: "p", save_to: { kind: "lead_custom", key: "resumo" } })], [edge("t", "g", always())]);
    const { db, persistir, insertEnrollmentEvent } = ponte(g, enrollment({ current_node_id: "g" }));
    await completeTurnForEnrollment(db, "org-1", "enr-1", "g", { kind: "generic_ai_done", text: "resumo pronto" }, clock);
    expect(persistir).toHaveBeenCalledWith(expect.objectContaining({ value: "resumo pronto" }));
    expect(insertEnrollmentEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: "node_parked" }));
  });

  it("acionamento com plano de tempo e sem saída: o plano fica salvo, e o lead para", async () => {
    const espera = no("w", "wait", { mode: "smart", min_ms: 600_000, max_ms: 1_800_000 });
    const g = grafo([trigger, espera], [edge("t", "w", always())]);
    const enr = enrollment({ current_node_id: "t" });
    const { db, updateEnrollment } = ponte({ ...g, edges: [] } as FlowGraph, enr);
    await completeTurnForEnrollment(
      db,
      "org-1",
      "enr-1",
      "t",
      { kind: "planned", propostas: [{ node_id: "w", escolhido_ms: 900_000, motivo: "x" }], modelo: "m" } as never,
      clock,
    );
    expect(updateEnrollment).toHaveBeenCalledWith("enr-1", "org-1", expect.objectContaining({ status: "completed", next_eval_at: null, timing_plan: expect.anything() }));
  });
});

// ─── Publicação: nenhuma saída solta reprova ─────────────────────────────────

describe("publicação — saída solta não reprova (o lead fica parado)", () => {
  const codigos = (g: FlowGraph): string[] => {
    const r = validateFlowForPublish(g, { surface: "followup" });
    return r.ok ? [] : r.errors.map((e) => e.code);
  };
  const PROIBIDOS = ["missing_branch_edge", "missing_always_fallback", "missing_class_edge", "missing_no_reply_edge", "no_end_path"];

  const NOS: Array<[string, FlowNode]> = [
    ["condição (por regra)", no("n", "condition", { combinator: "and", branching: "per_check", checks: [{ id: "c1", field: "tag", op: "contains", value: "vip" }] })],
    ["condição (combinada)", no("n", "condition", { combinator: "and", checks: [{ field: "tag", op: "contains", value: "vip" }] })],
    ["teste A/B", no("n", "ab_split", { branches: [{ id: "a", label: "A", percent: 50 }, { id: "b", label: "B", percent: 50 }] })],
    ["classificar", no("n", "ai_classify", { classes: ["a", "b"], grace_timeout_ms: 900_000, target: "last_reply" })],
    ["resposta", no("n", "match_reply", { branches: [{ id: "x", label: "X", op: "eq", pattern: "x" }], grace_timeout_ms: 900_000 })],
    ["menu", no("n", "menu", { prompt: "?", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], grace_timeout_ms: 900_000 })],
    ["distribuir", no("n", "attendant_route", { max_wait_minutes: 30 })],
    ["pergunta", no("n", "collect", { key: "cidade", label: "Cidade?", type: "text", required: true, permite_correcao: true, expiracao_tempo: 1 })],
    ["mensagem", no("n", "action", { mode: "text", body: "oi" })],
    ["notificar", no("n", "notify_agent", { message: "m" })],
  ];

  for (const [nome, node] of NOS) {
    it(`${nome}: sem nenhuma saída ligada, publica`, () => {
      const g = grafo([trigger, node], [edge("t", "n", always())]);
      const c = codigos(g);
      for (const p of PROIBIDOS) expect(c, nome).not.toContain(p);
    });
  }

  it("nó que NINGUÉM alcança também não é erro: ele só não roda (mesmo princípio da saída solta)", () => {
    const g = grafo([trigger, no("a", "action", { mode: "text", body: "oi" }), no("orfao", "action", { mode: "text", body: "x" })], [edge("t", "a", always())]);
    expect(codigos(g)).not.toContain("unreachable_node");
  });
});
