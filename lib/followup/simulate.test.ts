import { describe, expect, it, vi } from "vitest";

import { avancarSimulacao, iniciarSimulacao, type Classificador, type SimState } from "./simulate";
import type { FlowEdge, FlowGraph, FlowNode } from "./graph-schema";

const POS = { x: 0, y: 0 };

function no(partial: Omit<FlowNode, "position">): FlowNode {
  return { ...partial, position: POS } as FlowNode;
}

function aresta(overrides: Partial<FlowEdge> & Pick<FlowEdge, "source" | "target" | "condition">): FlowEdge {
  return { id: `${overrides.source}->${overrides.target}`, priority: 0, ...overrides };
}

const nuncaClassifica: Classificador = async () => {
  throw new Error("classificar() não deveria ser chamado neste teste");
};

async function iniciar(graph: FlowGraph, classificar: Classificador = nuncaClassifica): Promise<SimState> {
  const start = iniciarSimulacao(graph);
  if (!start.ok) throw new Error(start.erro);
  return avancarSimulacao({ graph, state: start.state, classificar });
}

describe("iniciarSimulacao", () => {
  it("recusa grafo sem exatamente um Gatilho", () => {
    const semGatilho: FlowGraph = {
      nodes: [no({ id: "e1", type: "end", label: "Fim", config: { outcome: "converted" } })],
      edges: [],
    };
    const r = iniciarSimulacao(semGatilho);
    expect(r.ok).toBe(false);
  });

  it("começa parado no nó Gatilho, sem transcript", () => {
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({ id: "e1", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [aresta({ source: "t1", target: "e1", condition: { type: "always" } })],
    };
    const r = iniciarSimulacao(graph);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.currentNodeId).toBe("t1");
    expect(r.state.transcript).toEqual([]);
  });
});

describe("avancarSimulacao — trigger → action → wait", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "a1",
          type: "action",
          label: "Mensagem de abertura",
          config: { mode: "text", body: "Oi! Tudo bem?" },
        }),
        no({
          id: "w1",
          type: "wait",
          label: "Aguardar resposta",
          config: { mode: "fixed", duration_ms: 300_000 },
        }),
        no({ id: "e1", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "a1", condition: { type: "always" } }),
        aresta({ source: "a1", target: "w1", condition: { type: "always" } }),
        aresta({ source: "w1", target: "e1", condition: { type: "always" } }),
      ],
    };
  }

  it("a rajada inicial atravessa trigger+action e para no wait, sem chamar IA nenhuma", async () => {
    const state = await iniciar(grafo());

    expect(state.status).toBe("aguardando_entrada");
    expect(state.aguardando).toBe("wait");
    expect(state.currentNodeId).toBe("w1");

    const mensagem = state.transcript.find((e) => e.kind === "mensagem_simulada");
    expect(mensagem).toMatchObject({ texto: "Oi! Tudo bem?", origem: "texto_fixo", nodeId: "a1" });
    expect(state.transcript.some((e) => e.kind === "aguardando" && e.motivo === "wait")).toBe(true);
  });

  it("marcar 'sem resposta' faz o wait elapsar e o fluxo concluir", async () => {
    const parado = await iniciar(grafo());
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "sem_resposta" },
      classificar: nuncaClassifica,
    });
    expect(depois.status).toBe("concluido");
    expect(depois.outcome).toEqual({ outcome: "converted" });
    expect(depois.transcript.at(-1)).toMatchObject({ kind: "fim", outcome: "converted" });
  });

  it("digitar uma mensagem corta a espera (wokeEarly) e avança na hora", async () => {
    const parado = await iniciar(grafo());
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "oi de volta" },
      classificar: nuncaClassifica,
    });
    expect(depois.status).toBe("concluido");
    expect(depois.transcript.find((e) => e.kind === "lead")).toMatchObject({ texto: "oi de volta" });
  });

  it("chamar avancarSimulacao com o estado já concluído é no-op", async () => {
    const parado = await iniciar(grafo());
    const concluido = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "sem_resposta" },
      classificar: nuncaClassifica,
    });
    const outraVez = await avancarSimulacao({
      graph: grafo(),
      state: concluido,
      entrada: { kind: "mensagem", texto: "qualquer coisa" },
      classificar: nuncaClassifica,
    });
    expect(outraVez).toEqual(concluido);
  });
});

describe("avancarSimulacao — wait imune a resposta", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "w1",
          type: "wait",
          label: "Espera imune",
          config: { mode: "fixed", duration_ms: 2_592_000_000, immune_to_reply: true },
        }),
        no({ id: "e1", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "w1", condition: { type: "always" } }),
        aresta({ source: "w1", target: "e1", condition: { type: "always" } }),
      ],
    };
  }

  it("mensagem do lead NÃO interrompe uma espera imune — continua aguardando o mesmo nó", async () => {
    const parado = await iniciar(grafo());
    expect(parado.currentNodeId).toBe("w1");
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "alô?" },
      classificar: nuncaClassifica,
    });
    expect(depois.status).toBe("aguardando_entrada");
    expect(depois.currentNodeId).toBe("w1");
    // só "sem resposta" (o prazo) tira essa espera do lugar:
    const concluido = await avancarSimulacao({
      graph: grafo(),
      state: depois,
      entrada: { kind: "sem_resposta" },
      classificar: nuncaClassifica,
    });
    expect(concluido.status).toBe("concluido");
  });
});

describe("avancarSimulacao — condition", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "c1",
          type: "condition",
          label: "É VIP?",
          config: { combinator: "and", checks: [{ field: "tag", op: "eq", value: "vip" }] },
        }),
        no({ id: "sim", type: "end", label: "Caminho VIP", config: { outcome: "converted" } }),
        no({ id: "nao", type: "end", label: "Caminho comum", config: { outcome: "exhausted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "c1", condition: { type: "always" } }),
        aresta({ source: "c1", target: "sim", condition: { type: "cond_result", value: true } }),
        aresta({ source: "c1", target: "nao", condition: { type: "cond_result", value: false } }),
      ],
    };
  }

  it("segue o ramo Não quando a tag simulada não bate", async () => {
    const state = await iniciar(grafo());
    expect(state.currentNodeId).toBe("nao");
    expect(state.outcome).toEqual({ outcome: "exhausted" });
  });

  it("segue o ramo Sim quando a tag simulada do lead bate com a condição", async () => {
    const start = iniciarSimulacao(grafo());
    if (!start.ok) throw start.erro;
    start.state.lead.tags = ["vip"];
    const state = await avancarSimulacao({ graph: grafo(), state: start.state, classificar: nuncaClassifica });
    expect(state.currentNodeId).toBe("sim");
    expect(state.outcome).toEqual({ outcome: "converted" });
  });
});

describe("avancarSimulacao — ai_classify roda a classificação DE VERDADE", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "cl1",
          type: "ai_classify",
          label: "Classificar interesse",
          config: { classes: ["Interessado", "Sem interesse"], grace_timeout_ms: 900_000, target: "last_reply" },
        }),
        no({ id: "hot", type: "end", label: "Quente", config: { outcome: "converted" } }),
        no({ id: "cold", type: "end", label: "Frio", config: { outcome: "exhausted" } }),
        no({ id: "semresp", type: "end", label: "Sem resposta", config: { outcome: "exhausted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "cl1", condition: { type: "always" } }),
        aresta({ source: "cl1", target: "hot", condition: { type: "class_match", value: "Interessado" } }),
        aresta({ source: "cl1", target: "cold", condition: { type: "class_match", value: "Sem interesse" } }),
        aresta({ source: "cl1", target: "semresp", condition: { type: "class_match", value: "no_reply" } }),
      ],
    };
  }

  it("para no nó e espera — NÃO classifica sem uma mensagem do operador", async () => {
    const state = await iniciar(grafo());
    expect(state.status).toBe("aguardando_entrada");
    expect(state.aguardando).toBe("ai_classify");
    expect(state.currentNodeId).toBe("cl1");
  });

  it("chama o classificador injetado com o texto digitado e as classes do nó, e roteia pela classe devolvida", async () => {
    const parado = await iniciar(grafo());
    const classificar = vi.fn<Classificador>(async () => "Interessado");
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "quero sim, me conta mais" },
      classificar,
    });
    expect(classificar).toHaveBeenCalledWith({
      candidateText: "quero sim, me conta mais",
      classes: ["Interessado", "Sem interesse"],
    });
    expect(depois.currentNodeId).toBe("hot");
    expect(depois.transcript.find((e) => e.kind === "classificado")).toMatchObject({ classe: "Interessado" });
  });

  it("'sem resposta' roteia por no_reply SEM chamar o classificador — mesmo caminho $0 da produção", async () => {
    const parado = await iniciar(grafo());
    const classificar = vi.fn<Classificador>(async () => "Interessado");
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "sem_resposta" },
      classificar,
    });
    expect(classificar).not.toHaveBeenCalled();
    expect(depois.currentNodeId).toBe("semresp");
  });

  it("erro do classificador vira um passo 'erro', não uma exceção não tratada", async () => {
    const parado = await iniciar(grafo());
    const classificar: Classificador = async () => {
      throw new Error("saída do modelo sem classe reconhecível");
    };
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "???" },
      classificar,
    });
    expect(depois.status).toBe("erro");
    expect(depois.transcript.at(-1)).toMatchObject({ kind: "erro", mensagem: expect.stringContaining("classe") });
  });
});

describe("avancarSimulacao — match_reply", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "mr1",
          type: "match_reply",
          label: "Quer agendar?",
          config: {
            branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }],
            grace_timeout_ms: 900_000,
          },
        }),
        no({ id: "agendou", type: "end", label: "Agendou", config: { outcome: "converted" } }),
        no({ id: "outros", type: "end", label: "Outros casos", config: { outcome: "exhausted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "mr1", condition: { type: "always" } }),
        aresta({ source: "mr1", target: "agendou", condition: { type: "branch", branch_id: "br_sim" } }),
        aresta({ source: "mr1", target: "outros", condition: { type: "always" } }),
      ],
    };
  }

  it("casa a resposta digitada contra as regras do nó, sem chamar IA nenhuma", async () => {
    const parado = await iniciar(grafo());
    expect(parado.aguardando).toBe("match_reply");
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "Sim, pode ser" },
      classificar: nuncaClassifica,
    });
    expect(depois.currentNodeId).toBe("agendou");
  });

  it("'sem resposta' com a saída «Sem resposta» solta: o lead fica PARADO — não escorrega para «Outros casos»", async () => {
    const parado = await iniciar(grafo());
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "sem_resposta" },
      classificar: nuncaClassifica,
    });
    expect(depois.currentNodeId).not.toBe("outros");
    expect(depois.transcript.at(-1)).toMatchObject({ kind: "parado" });
  });
});

describe("avancarSimulacao — match_reply em modo confirmação (if_exists: 'confirm')", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "mr1",
          type: "match_reply",
          label: "Confirma nome",
          config: {
            branches: [{ id: "br_x", label: "X", op: "contains", pattern: "x" }],
            grace_timeout_ms: 900_000,
            save_to: { kind: "lead_custom", key: "nome_preferido" },
            if_exists: "confirm",
          },
        }),
        no({ id: "fim", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "mr1", condition: { type: "always" } }),
        aresta({ source: "mr1", target: "fim", condition: { type: "always" } }),
      ],
    };
  }

  it("com o campo já preenchido, mostra a PERGUNTA DE CONFIRMAÇÃO como mensagem simulada e permanece no nó", async () => {
    const start = iniciarSimulacao(grafo());
    if (!start.ok) throw start.erro;
    start.state.lead.custom_fields = { nome_preferido: "Ana" };
    const state = await avancarSimulacao({ graph: grafo(), state: start.state, classificar: nuncaClassifica });

    expect(state.status).toBe("aguardando_entrada");
    expect(state.currentNodeId).toBe("mr1");
    expect(state.transcript.find((e) => e.kind === "mensagem_simulada")).toMatchObject({ origem: "confirmacao" });

    const depois = await avancarSimulacao({
      graph: grafo(),
      state,
      entrada: { kind: "mensagem", texto: "sim, isso mesmo" },
      classificar: nuncaClassifica,
    });
    expect(depois.currentNodeId).toBe("fim");
  });
});

describe("avancarSimulacao — repeat", () => {
  function grafo(): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({ id: "mr1", type: "match_reply", label: "Quantos filhos?", config: { branches: [{ id: "br_x", label: "X", op: "contains", pattern: "x" }], grace_timeout_ms: 900_000 } }),
        no({ id: "rep", type: "repeat", label: "Repetir pergunta", config: { max_count: 5 } }),
        no({ id: "corpo", type: "action", label: "Pergunta do corpo", config: { mode: "text", body: "Nome do filho {{volta}} de {{voltas}}?" } }),
        no({ id: "fim", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "mr1", condition: { type: "always" } }),
        aresta({ source: "mr1", target: "rep", condition: { type: "always" } }),
        aresta({ source: "rep", target: "corpo", condition: { type: "branch", branch_id: "body" } }),
        aresta({ source: "rep", target: "fim", condition: { type: "branch", branch_id: "done" } }),
        aresta({ source: "corpo", target: "rep", condition: { type: "always" } }),
      ],
    };
  }

  it("lê 'dois' da resposta e repete o corpo 2 vezes antes de concluir", async () => {
    const parado = await iniciar(grafo());
    const depois = await avancarSimulacao({
      graph: grafo(),
      state: parado,
      entrada: { kind: "mensagem", texto: "dois" },
      classificar: nuncaClassifica,
    });

    expect(depois.status).toBe("concluido");
    const mensagens = depois.transcript.filter((e) => e.kind === "mensagem_simulada");
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0]).toMatchObject({ texto: "Nome do filho 1 de 2?" });
    expect(mensagens[1]).toMatchObject({ texto: "Nome do filho 2 de 2?" });
  });
});

describe("avancarSimulacao — action", () => {
  it("modo ai_message mostra a ORIENTAÇÃO, sem chamar nenhuma IA de verdade", async () => {
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({ id: "a1", type: "action", label: "Mensagem livre", config: { mode: "ai_message", prompt_hint: "Cumprimente e pergunte o nome." } }),
        no({ id: "fim", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "a1", condition: { type: "always" } }),
        aresta({ source: "a1", target: "fim", condition: { type: "always" } }),
      ],
    };
    const state = await iniciar(graph);
    expect(state.transcript.find((e) => e.kind === "mensagem_simulada")).toMatchObject({
      texto: "Cumprimente e pergunte o nome.",
      origem: "ia",
    });
  });

  it("modo template mostra o id do modelo salvo (o conteúdo não é buscado)", async () => {
    const templateId = "11111111-1111-4111-8111-111111111111";
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({ id: "a1", type: "action", label: "Modelo salvo", config: { mode: "template", template_id: templateId } }),
        no({ id: "fim", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "a1", condition: { type: "always" } }),
        aresta({ source: "a1", target: "fim", condition: { type: "always" } }),
      ],
    };
    const state = await iniciar(graph);
    expect(state.transcript.find((e) => e.kind === "mensagem_simulada")).toMatchObject({
      texto: templateId,
      origem: "modelo_salvo",
    });
  });
});

describe("avancarSimulacao — end.ao_finalizar", () => {
  function grafoCom(ao_finalizar: unknown): FlowGraph {
    return {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "fim",
          type: "end",
          label: "Fim",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          config: { outcome: "converted", ao_finalizar } as any,
        }),
      ],
      edges: [aresta({ source: "t1", target: "fim", condition: { type: "always" } })],
    };
  }

  it("tipo 'nada' (ou ausente) não gera nenhum passo de finalização extra", async () => {
    const state = await iniciar(grafoCom({ tipo: "nada" }));
    expect(state.transcript.some((e) => e.kind === "finalizacao")).toBe(false);
  });

  it("tipo 'skill' mostra qual skill SERIA ativada, sem executá-la", async () => {
    const state = await iniciar(grafoCom({ tipo: "skill", skill_name: "recuperar-carrinho" }));
    expect(state.transcript.find((e) => e.kind === "finalizacao")).toMatchObject({
      tipo: "skill",
      detalhe: "recuperar-carrinho",
    });
  });

  it("tipo 'proximo_fluxo' mostra qual fluxo seria encadeado", async () => {
    const state = await iniciar(grafoCom({ tipo: "proximo_fluxo", fluxo: "outro-fluxo-id" }));
    expect(state.transcript.find((e) => e.kind === "finalizacao")).toMatchObject({
      tipo: "proximo_fluxo",
      detalhe: "outro-fluxo-id",
    });
  });
});

describe("avancarSimulacao — grafo mal formado", () => {
  it("nó sem aresta de saída PARA o lead ali (sem erro, sem exceção) e diz o motivo", async () => {
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({ id: "solto", type: "action", label: "Sem saída", config: { mode: "text", body: "oi" } }),
      ],
      edges: [aresta({ source: "t1", target: "solto", condition: { type: "always" } })],
    };
    const state = await iniciar(graph);
    expect(state.status).toBe("concluido");
    expect(state.transcript.at(-1)).toMatchObject({ kind: "parado", nodeId: "solto" });
    expect(state.transcript.some((t) => t.kind === "erro")).toBe(false);
  });

  it("ciclo sem saída para no teto de 80 passos em vez de travar", async () => {
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "c1",
          type: "condition",
          label: "Sempre verdadeiro",
          config: { combinator: "and", checks: [{ field: "steps_taken", op: "gte", value: 0 }] },
        }),
      ],
      edges: [
        aresta({ source: "t1", target: "c1", condition: { type: "always" } }),
        aresta({ source: "c1", target: "c1", condition: { type: "cond_result", value: true } }),
      ],
    };
    const state = await iniciar(graph);
    expect(state.status).toBe("erro");
    expect(state.transcript.at(-1)).toMatchObject({ kind: "erro" });
  });
});

describe("avancarSimulacao — menu", () => {
  const graph: FlowGraph = {
    nodes: [
      no({ id: "t1", type: "trigger", label: "Início", config: {} }),
      no({
        id: "menu1",
        type: "menu",
        label: "Ajuda",
        config: {
          prompt: "Como podemos ajudar?",
          options: [
            { id: "suporte", label: "Suporte" },
            { id: "vendas", label: "Vendas" },
          ],
          grace_timeout_ms: 900_000,
        },
      }),
      no({ id: "suporte", type: "end", label: "Suporte", config: { outcome: "exhausted" } }),
      no({ id: "vendas", type: "end", label: "Vendas", config: { outcome: "converted" } }),
      no({ id: "timeout", type: "end", label: "Sem resposta", config: { outcome: "exhausted" } }),
    ],
    edges: [
      aresta({ source: "t1", target: "menu1", condition: { type: "always" } }),
      aresta({ source: "menu1", target: "suporte", condition: { type: "branch", branch_id: "suporte" } }),
      aresta({ source: "menu1", target: "vendas", condition: { type: "branch", branch_id: "vendas" } }),
      aresta({ source: "menu1", target: "timeout", condition: { type: "branch", branch_id: "no_reply" } }),
      aresta({ source: "menu1", target: "timeout", condition: { type: "always" } }),
    ],
  };

  it("exibe o menu e roteia uma resposta digitada", async () => {
    const parado = await iniciar(graph);
    expect(parado.aguardando).toBe("menu");
    expect(parado.transcript).toContainEqual(
      expect.objectContaining({ kind: "mensagem_simulada", origem: "menu", texto: "Como podemos ajudar?\n\n1. Suporte\n2. Vendas" }),
    );
    const escolhido = await avancarSimulacao({
      graph,
      state: parado,
      entrada: { kind: "mensagem", texto: "2" },
      classificar: nuncaClassifica,
    });
    expect(escolhido.outcome).toEqual({ outcome: "converted" });
  });

  it("roteia sem resposta para o ramo de timeout", async () => {
    const parado = await iniciar(graph);
    const timeout = await avancarSimulacao({
      graph,
      state: parado,
      entrada: { kind: "sem_resposta" },
      classificar: nuncaClassifica,
    });
    expect(timeout.outcome).toEqual({ outcome: "exhausted" });
  });
});

describe("avancarSimulacao — attendant_route", () => {
  const graph: FlowGraph = {
    nodes: [
      no({ id: "t1", type: "trigger", label: "Início", config: {} }),
      no({ id: "route", type: "attendant_route", label: "Distribuir", config: { max_wait_minutes: 30 } }),
      no({ id: "assigned", type: "end", label: "Atribuído", config: { outcome: "converted" } }),
      no({ id: "timeout", type: "end", label: "Sem atendente", config: { outcome: "exhausted" } }),
    ],
    edges: [
      aresta({ source: "t1", target: "route", condition: { type: "always" } }),
      aresta({ source: "route", target: "assigned", condition: { type: "branch", branch_id: "assigned" } }),
      aresta({ source: "route", target: "timeout", condition: { type: "branch", branch_id: "timeout" } }),
      aresta({ source: "route", target: "timeout", condition: { type: "always" } }),
    ],
  };

  it("permite simular atribuição confirmada e prazo esgotado", async () => {
    const parado = await iniciar(graph);
    expect(parado.aguardando).toBe("attendant_route");
    const assigned = await avancarSimulacao({
      graph,
      state: parado,
      entrada: { kind: "resultado_atribuicao", atribuido: true },
      classificar: nuncaClassifica,
    });
    const timeout = await avancarSimulacao({
      graph,
      state: parado,
      entrada: { kind: "resultado_atribuicao", atribuido: false },
      classificar: nuncaClassifica,
    });
    expect(assigned.outcome).toEqual({ outcome: "converted" });
    expect(timeout.outcome).toEqual({ outcome: "exhausted" });
  });
});

describe("avancarSimulacao — nós paridade AcassIA (whatsapp_template, pix_payment, payment_gateway, meta_pixel)", () => {
  it("passa pelos nós emitindo prévias simuladas no transcript e conclui", async () => {
    const graph: FlowGraph = {
      nodes: [
        no({ id: "t1", type: "trigger", label: "Início", config: {} }),
        no({
          id: "wt1",
          type: "whatsapp_template",
          label: "Template",
          config: { template_name: "oferta_exclusiva", timeout: 30, timeout_unit: "Minutos" },
        }),
        no({
          id: "pix1",
          type: "pix_payment",
          label: "PIX",
          config: { key_type: "cpf", pix_key: "123.456.789-00", amount: "99,90", beneficiary: "Loja Teste" },
        }),
        no({
          id: "gw1",
          type: "payment_gateway",
          label: "Checkout",
          config: { currency: "BRL", amount: "197,00", open_amount: false, customer_name: "Cliente Teste", customer_phone: "11999999999" },
        }),
        no({
          id: "px1",
          type: "meta_pixel",
          label: "Pixel",
          config: { pixel_id: "pixel_123", event_type: "Compra", page_id: "pg_456", item_value: "197,00", currency: "BRL" },
        }),
        no({
          id: "vs1",
          type: "voice_studio",
          label: "Voice Studio",
          config: {
            text: "Olá! Seja muito bem-vindo!",
            stability: 0.5,
            similarity: 0.7,
            style: 0.5,
            speed: 1.0,
            send_as_voice_note: true,
            voice_id: "julieta",
            voice_name: "Julieta",
          },
        }),
        no({ id: "e1", type: "end", label: "Fim", config: { outcome: "converted" } }),
      ],
      edges: [
        aresta({ source: "t1", target: "wt1", condition: { type: "always" } }),
        aresta({ source: "wt1", target: "pix1", condition: { type: "always" } }),
        aresta({ source: "pix1", target: "gw1", condition: { type: "always" } }),
        aresta({ source: "gw1", target: "px1", condition: { type: "always" } }),
        aresta({ source: "px1", target: "vs1", condition: { type: "always" } }),
        aresta({ source: "vs1", target: "e1", condition: { type: "always" } }),
      ],
    };

    const final = await iniciar(graph);
    expect(final.status).toBe("concluido");
    expect(final.outcome).toEqual({ outcome: "converted" });

    const msgs = final.transcript.filter((e) => e.kind === "mensagem_simulada");
    expect(msgs).toHaveLength(5);
    expect(msgs[0]?.texto).toContain("[Template WhatsApp] oferta_exclusiva");
    // As bolhas reais do PIX: detalhes primeiro, a chave SOZINHA na última (para copiar).
    expect(msgs[1]?.texto).toContain("*Valor:* R$ 99,90");
    expect(msgs[1]?.texto).toContain("*Favorecido:* Loja Teste");
    expect(msgs[1]?.texto?.endsWith("— próxima mensagem —\n123.456.789-00")).toBe(true);
    expect(msgs[2]?.texto).toContain("[Cobrança Gateway] BRL 197,00");
    expect(msgs[3]?.texto).toContain('[Meta Pixel] Evento "Compra"');
    expect(msgs[4]?.texto).toContain('[Voice Studio · Julieta (Áudio gravado (PTT))] "Olá! Seja muito bem-vindo!"');
  });
});

