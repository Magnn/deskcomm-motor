import { describe, expect, it } from "vitest";

import {
  funilDaVenda,
  funilDoPainel,
  gastoDoFunil,
  lerPainel,
  nomeComparavel,
  nomesDosProdutosDoAgente,
  quizDoExtra,
  sugerirFunilDaCampanha,
  type ContextoDosFunis,
  type Funil,
} from "./funis";

const config = {
  pricing: {
    enabled: true,
    list_price_cents: 13000,
    list_product_links: [{ name: "Abertura do Coração", url: "https://exemplo.test/a" }],
    extras: [{ name: "Pergunta nova", price_cents: 700, when: "quando ela pedir outra pergunta" }],
    steps: [],
  },
};

const ctx = (over: Partial<ContextoDosFunis> = {}): ContextoDosFunis => ({
  produtos: {},
  agentesDoContato: new Map([
    ["c1", [{ agentId: "a1", ultimaEm: "2026-11-20T10:00:00.000Z" }]],
    [
      "c2",
      [
        { agentId: "a1", ultimaEm: "2026-11-10T10:00:00.000Z" },
        { agentId: "a2", ultimaEm: "2026-11-25T10:00:00.000Z" },
      ],
    ],
    ["c3", [{ agentId: "arquivado", ultimaEm: "2026-11-01T10:00:00.000Z" }]],
  ]),
  nomesPorAgente: new Map([
    ["a1", nomesDosProdutosDoAgente(config)],
    ["a2", new Set<string>()],
  ]),
  ...over,
});

const venda = (v: Partial<Parameters<typeof funilDaVenda>[0]>) => ({
  contact_id: null,
  notes: null,
  created_at: "2026-11-21T00:00:00.000Z",
  ...v,
});

describe("a venda conta onde fechou", () => {
  it("contato atendido vai para o agente, qualquer produto (área do cliente inclusive)", () => {
    expect(funilDaVenda(venda({ contact_id: "c1", notes: "30 créditos" }), ctx())).toBe("agente:a1");
  });

  it("dois agentes: vale o último que falou antes da venda", () => {
    expect(funilDaVenda(venda({ contact_id: "c2" }), ctx())).toBe("agente:a1");
    expect(funilDaVenda(venda({ contact_id: "c2", created_at: "2026-11-26T00:00:00.000Z" }), ctx())).toBe("agente:a2");
  });

  it("agente arquivado não é funil: sem funil", () => {
    expect(funilDaVenda(venda({ contact_id: "c3" }), ctx())).toBeNull();
  });

  it("cobrança de quiz fecha no quiz, mesmo de quem falou com o agente", () => {
    expect(funilDaVenda(venda({ contact_id: "c1", extra_nome: "quiz-sombra" }), ctx())).toBe("quiz:sombra");
    expect(funilDaVenda(venda({ contact_id: "c1", extra_nome: "sinastria-quiz" }), ctx())).toBe("quiz:sinastria");
  });

  it("produto ligado na tela vence tudo", () => {
    const c = ctx({ produtos: { "mega pack de mandalas": "pagina:mandalas" } });
    expect(funilDaVenda(venda({ contact_id: "c1", notes: "Mega Pack de Mandalas" }), c)).toBe("pagina:mandalas");
  });

  it("sem contato: produto do catálogo de um agente", () => {
    expect(funilDaVenda(venda({ notes: "2× Pergunta nova" }), ctx())).toBe("agente:a1");
  });

  it("sem contato e produto de fora: sem funil", () => {
    expect(funilDaVenda(venda({ notes: "Mega Pack de Mandalas" }), ctx())).toBeNull();
    expect(funilDaVenda(venda({}), ctx())).toBeNull();
  });
});

describe("peças", () => {
  const funis: Funil[] = [
    { chave: "agente:a1", tipo: "agente", id: "a1", nome: "Cigana Esmeralda" },
    { chave: "quiz:sombra", tipo: "quiz", id: "sombra", nome: "Quiz Sombra" },
    { chave: "pagina:mandalas-lider", tipo: "pagina", id: "mandalas-lider", nome: "Página mandalas-lider" },
  ];

  it("nome comparável", () => {
    expect(nomeComparavel("2× Pergunta nova")).toBe("pergunta nova");
    expect(nomeComparavel(" Abertura do Coração ")).toBe("abertura do coracao");
  });

  it("quiz do extra", () => {
    expect(quizDoExtra("quiz-par")).toBe("par");
    expect(quizDoExtra("quiz-inexistente")).toBeNull();
    expect(quizDoExtra("Pergunta nova")).toBeNull();
    expect(quizDoExtra(null)).toBeNull();
  });

  it("funil do painel: URL > padrão; 'todos' e desconhecido = geral", () => {
    expect(funilDoPainel(null, "agente:a1", funis)?.chave).toBe("agente:a1");
    expect(funilDoPainel("quiz:sombra", "agente:a1", funis)?.chave).toBe("quiz:sombra");
    expect(funilDoPainel("todos", "agente:a1", funis)).toBeNull();
    expect(funilDoPainel("agente:outro", null, funis)).toBeNull();
    expect(funilDoPainel(null, null, funis)).toBeNull();
  });

  it("sugere o funil da campanha pelo nome, só quando há um candidato", () => {
    expect(sugerirFunilDaCampanha("VENDAS | ZAP 7336 | CIGANA | 26-11", funis)).toBe("agente:a1");
    expect(sugerirFunilDaCampanha("MANDALAS | LIDER | 24-10", funis)).toBe("pagina:mandalas-lider");
    expect(sugerirFunilDaCampanha("QUIZ SOMBRA", funis)).toBe("quiz:sombra");
    expect(sugerirFunilDaCampanha("Campanha qualquer", funis)).toBeNull();
  });

  it("gasto do funil soma só as campanhas ligadas", () => {
    const c = [
      { id: "1", centavos: 1000 },
      { id: "2", centavos: 500 },
      { id: "3", centavos: 70 },
    ];
    expect(gastoDoFunil(c, { "1": "agente:a1", "3": "agente:a1", "2": "quiz:sombra" }, "agente:a1")).toBe(1070);
  });

  it("lerPainel tolera lixo", () => {
    expect(lerPainel({ painel: { funil_padrao: "agente:a1" } }).funil_padrao).toBe("agente:a1");
    expect(lerPainel({ painel: { funil_padrao: 12 } })).toEqual({ funil_padrao: null, produtos: {}, campanhas: {} });
    expect(lerPainel(null).produtos).toEqual({});
  });
});
