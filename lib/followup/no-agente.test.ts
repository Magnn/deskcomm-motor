import { describe, expect, it } from "vitest";

import { carregaAgentesCitados, idsDeAgenteCitados, type AgenteCitado } from "./agentes-citados";
import { resumoDoNo } from "./eventos-legiveis";
import {
  AGENT_CONCLUDED_BRANCH_ID,
  AGENT_LIMIT_BRANCH_ID,
  AGENT_NODE_DEFAULT_MAX_TURNS,
  AGENT_NODE_DEFAULT_SILENCE_MINUTES,
  AGENT_NODE_UNSET_ID,
  AGENT_SILENCE_BRANCH_ID,
  FALLBACK_BRANCH_ID,
  agentNodeConfigSchema,
  flowNodeSchema,
  nodeBranches,
  type FlowEdge,
  type FlowGraph,
  type FlowNode,
} from "./graph-schema";
import { processNode, type EnrollmentRow, type LeadFacts } from "./node-handlers";
import { avancarSimulacao, iniciarSimulacao, type Classificador, type SimState } from "./simulate";
import { NOS_DA_SUPERFICIE, NOS_EM_CONSTRUCAO, validateFlowForPublish } from "./validate-publish";

/**
 * O nó "Agente de IA" — fatia 2 de 4: schema, publicação e simulador. O MOTOR (fatia 3) e o editor (fatia 4)
 * ainda não existem, então o nó nasce "no escuro": o publish o recusa (`no_em_construcao`), a paleta não o
 * oferece, e o passo do motor falha com o motivo se algum dia uma inscrição chegar nele.
 *
 * O que estes testes prendem, em ordem de importância:
 *   1. o nó NÃO PUBLICA enquanto o motor não existe — e quando o motor entrar, este teste é o que avisa que a
 *      lista `NOS_EM_CONSTRUCAO` precisa ser esvaziada de propósito;
 *   2. o `agent_id` vem do cliente e só vale se o agente existe NESTA organização, não foi arquivado, conduz
 *      conversa e tem versão publicada;
 *   3. as três saídas (cumpriu / limite / silêncio) precisam levar a algum lugar;
 *   4. o simulador nunca roda o agente: para no nó e deixa o operador escolher a saída;
 *   5. a projeção que a tela de leitura mostra não vaza o objetivo (instrução escrita pelo dono do fluxo).
 */

const POS = { x: 0, y: 0 };
const AGENTE = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const OUTRO_AGENTE = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";

function noAgente(over: Partial<Extract<FlowNode, { type: "agent" }>["config"]> = {}, id = "ag"): FlowNode {
  return {
    id,
    type: "agent",
    label: "Atendimento",
    position: POS,
    config: { agent_id: AGENTE, objetivo: "Agendar uma visita", max_turnos: 10, silencio_minutos: 60, ...over },
  };
}
const gatilho = (): FlowNode => ({ id: "t", type: "trigger", label: "Início", position: POS, config: {} });
const fim = (id: string, outcome: "converted" | "exhausted" | "custom" = "converted"): FlowNode => ({
  id,
  type: "end",
  label: `Fim ${id}`,
  position: POS,
  config: { outcome },
});
const aresta = (source: string, target: string, condition: FlowEdge["condition"]): FlowEdge => ({
  id: `${source}->${target}:${JSON.stringify(condition)}`,
  source,
  target,
  priority: 0,
  condition,
});
const saida = (branch_id: string): FlowEdge["condition"] => ({ type: "branch", branch_id });

/** trigger → agente → três fins, um por saída. */
function fluxoCompleto(agente: FlowNode = noAgente()): FlowGraph {
  return {
    nodes: [gatilho(), agente, fim("f-ok", "converted"), fim("f-limite", "exhausted"), fim("f-silencio", "custom")],
    edges: [
      aresta("t", agente.id, { type: "always" }),
      aresta(agente.id, "f-ok", saida(AGENT_CONCLUDED_BRANCH_ID)),
      aresta(agente.id, "f-limite", saida(AGENT_LIMIT_BRANCH_ID)),
      aresta(agente.id, "f-silencio", saida(AGENT_SILENCE_BRANCH_ID)),
    ],
  };
}

const CITADO_OK: AgenteCitado = { nome: "Ana", arquivado: false, tipo: "mcp_agent", publicado: true };
const contexto = (agentes: Array<[string, AgenteCitado]> = [[AGENTE, CITADO_OK]]) => ({ agentes: new Map(agentes) });

function codigos(g: FlowGraph, ctx: Parameters<typeof validateFlowForPublish>[1] = contexto()): string[] {
  const r = validateFlowForPublish(g, ctx);
  return r.ok ? [] : r.errors.map((e) => e.code);
}

describe("agentNodeConfigSchema", () => {
  it("aceita o mínimo e injeta os padrões: 10 respostas e 60 minutos de silêncio", () => {
    const r = agentNodeConfigSchema.parse({ agent_id: AGENTE, objetivo: "Qualificar o lead" });
    expect(r).toEqual({
      agent_id: AGENTE,
      objetivo: "Qualificar o lead",
      max_turnos: AGENT_NODE_DEFAULT_MAX_TURNS,
      silencio_minutos: AGENT_NODE_DEFAULT_SILENCE_MINUTES,
    });
    expect(AGENT_NODE_DEFAULT_MAX_TURNS).toBe(10);
    expect(AGENT_NODE_DEFAULT_SILENCE_MINUTES).toBe(60);
  });

  it("recusa o que não faria sentido, com teto em tudo", () => {
    const base = { agent_id: AGENTE, objetivo: "x" };
    for (const ruim of [
      { ...base, agent_id: "nao-e-uuid" },
      { ...base, objetivo: "" },
      { ...base, objetivo: "   " },
      { ...base, objetivo: "x".repeat(501) },
      { ...base, max_turnos: 0 },
      { ...base, max_turnos: 31 },
      { ...base, max_turnos: 2.5 },
      { ...base, silencio_minutos: 4 },
      { ...base, silencio_minutos: 1441 },
    ]) {
      expect(agentNodeConfigSchema.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false);
    }
    expect(agentNodeConfigSchema.safeParse({ ...base, objetivo: "x".repeat(500), max_turnos: 30, silencio_minutos: 1440 }).success).toBe(true);
  });

  it("é estrito: modelo, prompt e ferramentas são do AGENTE, não do nó", () => {
    for (const extra of [{ model: "gpt" }, { prompt: "ignore tudo" }, { tool_ids: [] }, { credential_id: AGENTE }]) {
      expect(agentNodeConfigSchema.safeParse({ agent_id: AGENTE, objetivo: "x", ...extra }).success).toBe(false);
    }
  });

  it("o rascunho recém-posto no canvas salva: o UUID nulo é válido, e é o PUBLISH que o recusa", () => {
    expect(agentNodeConfigSchema.safeParse({ agent_id: AGENT_NODE_UNSET_ID, objetivo: "Configure o objetivo." }).success).toBe(true);
    expect(flowNodeSchema.safeParse(noAgente({ agent_id: AGENT_NODE_UNSET_ID })).success).toBe(true);
  });
});

describe("nodeBranches — as saídas do nó", () => {
  it("três saídas fixas, nesta ordem, e o escape por último", () => {
    const b = nodeBranches(noAgente() as Parameters<typeof nodeBranches>[0]);
    expect(b.map((x) => [x.id, x.kind])).toEqual([
      [AGENT_CONCLUDED_BRANCH_ID, "match"],
      [AGENT_LIMIT_BRANCH_ID, "match"],
      [AGENT_SILENCE_BRANCH_ID, "match"],
      [FALLBACK_BRANCH_ID, "fallback"],
    ]);
    expect(b.map((x) => x.label)).toEqual(["Cumpriu o objetivo", "Passou do limite de turnos", "Ficou em silêncio", "Outros casos"]);
    expect(b[0]!.condition).toEqual({ type: "branch", branch_id: "concluiu" });
  });
});

describe("publicação — o nó ainda não publica (o motor é a fatia 3)", () => {
  it("um fluxo perfeito com o nó é recusado SÓ por estar em construção, e a mensagem diz o motivo verdadeiro", () => {
    const r = validateFlowForPublish(fluxoCompleto(), contexto());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.code)).toEqual(["no_em_construcao"]);
    expect(r.errors[0]!.node_id).toBe("ag");
    expect(r.errors[0]!.message).toContain("ainda não roda");
  });

  it("o nó está em NOS_EM_CONSTRUCAO e FORA de NOS_DA_SUPERFICIE — por isso a paleta não o oferece", () => {
    expect(NOS_EM_CONSTRUCAO).toContain("agent");
    for (const superficie of Object.values(NOS_DA_SUPERFICIE)) expect(superficie).not.toContain("agent");
  });

  it("um fluxo sem o nó não muda: continua publicando", () => {
    const g: FlowGraph = { nodes: [gatilho(), fim("f")], edges: [aresta("t", "f", { type: "always" })] };
    expect(validateFlowForPublish(g, contexto())).toEqual({ ok: true });
  });
});

describe("publicação — as regras do nó (rodam mesmo com o gate ligado)", () => {
  it("agente não escolhido: o UUID nulo do canvas é recusado, sem precisar do banco", () => {
    const g = fluxoCompleto(noAgente({ agent_id: AGENT_NODE_UNSET_ID }));
    expect(codigos(g)).toContain("agente_nao_escolhido");
    expect(codigos(g, {})).toContain("agente_nao_escolhido");
    expect(codigos(g)).not.toContain("agente_indisponivel");
  });

  it("agente que não existe NESTA organização: recusado (a consulta filtra a organização)", () => {
    const r = validateFlowForPublish(fluxoCompleto(), contexto([[OUTRO_AGENTE, CITADO_OK]]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const e = r.errors.find((x) => x.code === "agente_indisponivel");
    expect(e?.message).toContain("não existe mais");
  });

  it.each([
    ["arquivado", { ...CITADO_OK, arquivado: true }, "foi arquivado"],
    ["do tipo antigo (rag_bot)", { ...CITADO_OK, tipo: "rag_bot" }, "agente antigo"],
    ["sem versão publicada", { ...CITADO_OK, publicado: false }, "não tem versão publicada"],
  ])("agente %s: recusado, com o nome dele na frase", (_nome, agente, trecho) => {
    const r = validateFlowForPublish(fluxoCompleto(), contexto([[AGENTE, agente]]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const e = r.errors.find((x) => x.code === "agente_indisponivel");
    expect(e?.message).toContain(trecho);
    expect(e?.message).toContain("Ana");
  });

  it("sem o contexto do banco, a existência do agente NÃO é adivinhada", () => {
    expect(codigos(fluxoCompleto(), {})).not.toContain("agente_indisponivel");
  });

  it("cada saída sem aresta é apontada pelo nome da saída — o editor ancora na bolinha certa", () => {
    const g = fluxoCompleto();
    g.edges = g.edges.filter((e) => !(e.source === "ag" && e.condition.type === "branch" && e.condition.branch_id === "limite"));
    const r = validateFlowForPublish(g, contexto());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const solta = r.errors.filter((e) => e.code === "missing_branch_edge");
    expect(solta.map((e) => e.branch_id)).toEqual(["limite"]);
    expect(solta[0]!.message).toContain("Passou do limite de turnos");
  });

  it("a saída de escape NÃO é cobrada: as três saídas esgotam o que o motor produz", () => {
    expect(codigos(fluxoCompleto())).not.toContain("missing_always_fallback");
  });

  it("um laço em que o agente devolve o lead ao próprio agente não é 'ciclo sem espera': o silêncio é a espera", () => {
    const g = fluxoCompleto();
    g.edges = g.edges.map((e) =>
      e.condition.type === "branch" && e.condition.branch_id === "silencio" ? aresta("ag", "ag", saida("silencio")) : e,
    );
    expect(codigos(g)).not.toContain("cycle_without_wait");
  });
});

describe("carregaAgentesCitados", () => {
  /** Dublê do encadeamento `from().select().eq().in()` — grava o que foi pedido. */
  function clienteFalso(resposta: { data: unknown; error: { message: string } | null }) {
    const pedido: { tabela?: string; filtros: Array<[string, unknown]> } = { filtros: [] };
    const consulta = {
      select: () => consulta,
      eq: (col: string, v: unknown) => (pedido.filtros.push([col, v]), consulta),
      in: (col: string, v: unknown) => (pedido.filtros.push([col, v]), Promise.resolve(resposta)),
    };
    return { pedido, cliente: { from: (t: string) => ((pedido.tabela = t), consulta) } as never };
  }

  it("colhe os ids sem repetir e sem o UUID nulo do canvas", () => {
    const nos = [noAgente({}, "a1"), noAgente({}, "a2"), noAgente({ agent_id: AGENT_NODE_UNSET_ID }, "a3"), noAgente({ agent_id: OUTRO_AGENTE }, "a4"), gatilho()];
    expect(idsDeAgenteCitados(nos)).toEqual([AGENTE, OUTRO_AGENTE]);
  });

  it("não consulta o banco quando não há nó de agente", async () => {
    const { cliente, pedido } = clienteFalso({ data: [], error: null });
    expect(await carregaAgentesCitados(cliente, "org-1", [gatilho()])).toEqual({ ok: true, agentes: new Map() });
    expect(pedido.tabela).toBeUndefined();
  });

  it("filtra pela ORGANIZAÇÃO e traduz a linha (arquivado, tipo, publicado)", async () => {
    const { cliente, pedido } = clienteFalso({
      data: [
        { id: AGENTE, name: "Ana", kind: "mcp_agent", archived_at: null, published_version_id: "v1" },
        { id: OUTRO_AGENTE, name: "Velho", kind: "rag_bot", archived_at: "2026-09-01T00:00:00Z", published_version_id: null },
      ],
      error: null,
    });
    const r = await carregaAgentesCitados(cliente, "org-1", [noAgente(), noAgente({ agent_id: OUTRO_AGENTE }, "b")]);
    expect(pedido.tabela).toBe("ai_agents");
    expect(pedido.filtros).toContainEqual(["organization_id", "org-1"]);
    expect(r).toEqual({
      ok: true,
      agentes: new Map<string, AgenteCitado>([
        [AGENTE, { nome: "Ana", arquivado: false, tipo: "mcp_agent", publicado: true }],
        [OUTRO_AGENTE, { nome: "Velho", arquivado: true, tipo: "rag_bot", publicado: false }],
      ]),
    });
  });

  it("falha de leitura vira erro explícito, nunca mapa vazio — vazio reprovaria todo agente como apagado", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "timeout" } });
    expect(await carregaAgentesCitados(cliente, "org-1", [noAgente()])).toEqual({ ok: false, mensagem: "timeout" });
  });
});

describe("simulador — o agente é uma caixa-preta e o operador escolhe a saída", () => {
  const nuncaClassifica: Classificador = async () => {
    throw new Error("classificar() não deveria ser chamado: o agente não roda no simulador");
  };

  async function ate(graph: FlowGraph): Promise<SimState> {
    const inicio = iniciarSimulacao(graph);
    if (!inicio.ok) throw new Error(inicio.erro);
    return avancarSimulacao({ graph, state: inicio.state, classificar: nuncaClassifica });
  }

  it("para no nó, aguardando o agente, e diz isso no transcript", async () => {
    const s = await ate(fluxoCompleto());
    expect(s.status).toBe("aguardando_entrada");
    expect(s.aguardando).toBe("agent");
    expect(s.currentNodeId).toBe("ag");
    expect(s.transcript.at(-1)).toEqual({ kind: "aguardando", nodeId: "ag", motivo: "agent" });
  });

  it.each([
    ["concluiu", "f-ok"],
    ["limite", "f-limite"],
    ["silencio", "f-silencio"],
  ] as const)("a saída '%s' leva ao fim certo (%s) e fica registrada", async (saidaEscolhida, fimEsperado) => {
    const g = fluxoCompleto();
    const parado = await ate(g);
    const depois = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "saida_do_agente", saida: saidaEscolhida }, classificar: nuncaClassifica });
    expect(depois.status).toBe("concluido");
    expect(depois.transcript).toContainEqual({ kind: "saida_do_agente", nodeId: "ag", saida: saidaEscolhida });
    expect(depois.transcript.some((e) => e.kind === "fim" && e.nodeId === fimEsperado)).toBe(true);
  });

  it("'sem resposta' vale como silêncio, o mesmo sinal de prazo esgotado dos outros nós", async () => {
    const g = fluxoCompleto();
    const parado = await ate(g);
    const depois = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "sem_resposta" }, classificar: nuncaClassifica });
    expect(depois.status).toBe("concluido");
    expect(depois.transcript.some((e) => e.kind === "fim" && e.nodeId === "f-silencio")).toBe(true);
  });

  it("uma mensagem digitada NÃO avança: o agente ainda estaria conduzindo — e a espera não se duplica", async () => {
    const g = fluxoCompleto();
    const parado = await ate(g);
    const depois = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "mensagem", texto: "oi, tudo bem?" }, classificar: nuncaClassifica });
    expect(depois.status).toBe("aguardando_entrada");
    expect(depois.aguardando).toBe("agent");
    expect(depois.currentNodeId).toBe("ag");
    expect(depois.transcript.filter((e) => e.kind === "aguardando")).toHaveLength(1);
    expect(depois.transcript).toContainEqual({ kind: "lead", texto: "oi, tudo bem?" });
  });

  it("saída sem aresta é erro legível, e não um passo no escuro", async () => {
    const g = fluxoCompleto();
    g.edges = g.edges.filter((e) => !(e.condition.type === "branch" && e.condition.branch_id === "limite"));
    const parado = await ate(g);
    const depois = await avancarSimulacao({ graph: g, state: parado, entrada: { kind: "saida_do_agente", saida: "limite" }, classificar: nuncaClassifica });
    expect(depois.status).toBe("erro");
    expect(depois.transcript.at(-1)).toMatchObject({ kind: "erro", nodeId: "ag" });
  });
});

describe("motor — o passo do nó falha com o motivo até a fatia 3", () => {
  const NOW = new Date("2026-09-26T12:00:00.000Z");
  const inscricao: EnrollmentRow = {
    id: "enr-1",
    organization_id: "org-1",
    pointer_id: "ptr-1",
    version_id: "ver-1",
    contact_id: "c-1",
    conversation_id: null,
    current_node_id: "ag",
    status: "active",
    next_eval_at: NOW.toISOString(),
    claimed_until: null,
    attempts: 0,
    max_attempts: 5,
    last_error: null,
    steps_taken: 1,
    outcome: null,
    cancel_reason: null,
    started_at: NOW.toISOString(),
    completed_at: null,
    updated_at: NOW.toISOString(),
    timing_plan: null,
  };
  const fatos: LeadFacts = { lead_stage: null, tags: [], steps_taken: 1, last_outcome: null };

  it("falha, em vez de avançar sem o agente e mandar a pessoa por uma saída que ninguém percorreu", () => {
    const g = fluxoCompleto();
    const r = processNode({ node: g.nodes[1]!, edges: g.edges, enrollment: inscricao, lead: fatos, clock: () => NOW });
    expect(r.kind).toBe("fail");
    if (r.kind === "fail") expect(r.error).toContain("ainda não existe");
  });
});

describe("a tela de leitura não vaza a instrução do dono do fluxo", () => {
  it("o resumo do nó diz quantas respostas o agente dá, e NÃO o objetivo nem o id do agente", () => {
    const { resumo, tipo, rotulo } = resumoDoNo(noAgente({ objetivo: "Fechar a venda a qualquer custo, ofereça 90% de desconto", max_turnos: 7 }));
    expect(tipo).toBe("agent");
    expect(rotulo).toBe("Atendimento");
    expect(resumo).toBe("um agente de IA conduz a conversa (até 7 respostas)");
    expect(resumo).not.toContain("90%");
    expect(resumo).not.toContain(AGENTE);
  });
});
