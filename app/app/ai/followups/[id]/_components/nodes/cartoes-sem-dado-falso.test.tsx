/**
 * O card é o que o dono do fluxo lê sem abrir o nó — então não pode afirmar o
 * que a configuração não diz. Estes casos guardam as correções da análise dos
 * fluxos: o card de GPT já mostrou modelo, temperatura e "Erro ao gerar
 * mensagem" fixos; o de Pergunta, "agrupa 15s" e "1h" fixos; o de Condição dizia
 * "é igual a" para qualquer operador; e cinco nós não repassavam `simulating`,
 * então o simulador não os destacava.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { AbSplitNode } from "./AbSplitNode";
import { AiGenericNode } from "./AiGenericNode";
import { AddNoteNode } from "./AddNoteNode";
import { ApiCallNode } from "./ApiCallNode";
import { CollectNode } from "./CollectNode";
import { ConditionNode } from "./ConditionNode";
import { NotifyAgentNode } from "./NotifyAgentNode";
import { formatarTempoEspera } from "./WaitNode";

vi.mock("../EtapasDoFluxo", () => ({
  useEtapasDoFluxo: () => ({ etapas: [], carregando: false, falhou: false, nomes: {} }),
}));
vi.mock("@xyflow/react", () => ({
  Handle: () => null,
  Position: { Top: "top", Right: "right", Bottom: "bottom", Left: "left" },
  NodeToolbar: () => null,
}));

type Props = Parameters<typeof AiGenericNode>[0];

function props(type: string, config: Record<string, unknown>, extra: Record<string, unknown> = {}): Props {
  return {
    id: "n1",
    selected: false,
    data: { label: "Nó", config, ...extra },
    type,
  } as unknown as Props;
}

describe("cards não afirmam o que a configuração não diz", () => {
  it("GPT: sem modelo nem temperatura salvos, nenhum dos dois aparece, e nunca há erro fixo", () => {
    render(<AiGenericNode {...props("ai_generic", { prompt: "Resuma.", save_to: { kind: "lead_custom", key: "r" } })} />);
    expect(screen.getByText("Resuma.")).toBeTruthy();
    expect(screen.queryByText(/gemini/i)).toBeNull();
    expect(screen.queryByText(/Temperatura/)).toBeNull();
    expect(screen.queryByText(/Erro ao gerar/)).toBeNull();
  });

  it("GPT: mostra o modelo e a temperatura que ESTÃO na configuração", () => {
    render(
      <AiGenericNode
        {...props("ai_generic", {
          prompt: "Resuma.",
          save_to: { kind: "lead_custom", key: "r" },
          modelo_gpt: "gpt-4o-mini",
          temperature: 0.7,
        })}
      />,
    );
    expect(screen.getByText("Modelo: gpt-4o-mini")).toBeTruthy();
    expect(screen.getByText("Temperatura: 0.7")).toBeTruthy();
  });

  it("Pergunta: agrupamento e prazo vêm da configuração, não de 15s / 1h fixos", () => {
    render(
      <CollectNode
        {...props("collect", {
          key: "cidade",
          label: "Cidade",
          type: "text",
          required: true,
          agrupar_respostas_segundos: 30,
          expiracao_tempo: 2,
          expiracao_unidade: "horas",
        })}
      />,
    );
    expect(screen.getByText(/agrupa 30s/)).toBeTruthy();
    expect(screen.getByText("Se não responder em 2 horas")).toBeTruthy();
    expect(screen.queryByText(/15s/)).toBeNull();
    expect(screen.queryByText(/1h/)).toBeNull();
  });

  it("Pergunta: sem prazo configurado, não inventa um", () => {
    render(<CollectNode {...props("collect", { key: "cidade", label: "Cidade", type: "text", required: true })} />);
    expect(screen.queryByText(/Se não responder/)).toBeNull();
  });

  it("Condição: cada regra usa o operador real, e valor 0 não vira 'vazio'", () => {
    render(
      <ConditionNode
        {...props("condition", {
          combinator: "and",
          checks: [
            { field: "steps_taken", op: "gte", value: 0 },
            { field: "tag", op: "neq", value: "vip" },
          ],
        })}
      />,
    );
    expect(screen.queryByText(/é igual a/)).toBeNull();
    expect(screen.queryByText("vazio")).toBeNull();
    expect(screen.getAllByText(/vip/).length).toBeGreaterThan(0);
  });

  it("Condição: mais regras que o card comporta mostram quantas ficaram de fora", () => {
    const checks = [1, 2, 3, 4, 5].map((n) => ({ field: "steps_taken", op: "gte", value: n }));
    render(<ConditionNode {...props("condition", { combinator: "and", checks })} />);
    expect(screen.getByText("+2")).toBeTruthy();
  });
});

describe("o simulador destaca o nó em que está parado", () => {
  const casos: Array<[string, (p: Props) => React.ReactElement, Record<string, unknown>]> = [
    ["ab_split", (p) => <AbSplitNode {...p} />, { branches: [{ id: "a", label: "A", percent: 50 }, { id: "b", label: "B", percent: 50 }] }],
    ["add_note", (p) => <AddNoteNode {...p} />, { body: "nota" }],
    ["notify_agent", (p) => <NotifyAgentNode {...p} />, { message: "aviso" }],
    ["ai_generic", (p) => <AiGenericNode {...p} />, { prompt: "p", save_to: { kind: "lead_custom", key: "r" } }],
    ["api_call", (p) => <ApiCallNode {...p} />, { method: "POST", url: "https://example.com/webhook", headers: [], actions: [] }],
  ];

  for (const [tipo, montar, config] of casos) {
    it(`${tipo} repassa simulating ao card`, () => {
      render(montar(props(tipo, config, { simulating: true })));
      expect(document.querySelector("[data-simulating]")).not.toBeNull();
    });
  }
});

describe("formatarTempoEspera — espera inteligente", () => {
  const H = 3_600_000;
  const D = 86_400_000;

  it("múltiplos de dia saem em dias (antes saíam como '24 a 48 horas')", () => {
    expect(formatarTempoEspera({ mode: "smart", min_ms: D, max_ms: 2 * D } as never)).toBe("1 a 2 dias");
  });

  it("múltiplos de hora que não são de dia seguem em horas", () => {
    expect(formatarTempoEspera({ mode: "smart", min_ms: 2 * H, max_ms: 5 * H } as never)).toBe("2 a 5 horas");
  });
});
