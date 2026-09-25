/**
 * Painel do Simulador — comportamento de ponta a ponta contra o driver PURO
 * (lib/followup/simulate.ts), sem mockar o driver: só a rota de classificação
 * (`apiClient.post`) é dublê, porque é a única chamada de rede que o painel faz.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const postMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { post: (...args: unknown[]) => postMock(...args) },
}));

import type { FlowGraph } from "@/lib/followup/graph-schema";
import { SimulatorPanel } from "./SimulatorPanel";

const POS = { x: 0, y: 0 };

function graphSimples(): FlowGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", label: "Início", position: POS, config: {} },
      {
        id: "a1",
        type: "action",
        label: "Abertura",
        position: POS,
        config: { mode: "text", body: "Oi! Tudo bem?" },
      },
      {
        id: "w1",
        type: "wait",
        label: "Aguardar",
        position: POS,
        config: { mode: "fixed", duration_ms: 300_000 },
      },
      { id: "fim", type: "end", label: "Fim", position: POS, config: { outcome: "converted" } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "a1", priority: 0, condition: { type: "always" } },
      { id: "e2", source: "a1", target: "w1", priority: 0, condition: { type: "always" } },
      { id: "e3", source: "w1", target: "fim", priority: 0, condition: { type: "always" } },
    ],
  };
}

function graphComClassify(): FlowGraph {
  return {
    nodes: [
      { id: "t1", type: "trigger", label: "Início", position: POS, config: {} },
      {
        id: "cl1",
        type: "ai_classify",
        label: "Classificar",
        position: POS,
        config: { classes: ["Interessado", "Sem interesse"], grace_timeout_ms: 900_000, target: "last_reply" },
      },
      { id: "hot", type: "end", label: "Quente", position: POS, config: { outcome: "converted" } },
      { id: "cold", type: "end", label: "Frio", position: POS, config: { outcome: "exhausted" } },
    ],
    edges: [
      { id: "e1", source: "t1", target: "cl1", priority: 0, condition: { type: "always" } },
      { id: "e2", source: "cl1", target: "hot", priority: 0, condition: { type: "class_match", value: "Interessado" } },
      { id: "e3", source: "cl1", target: "cold", priority: 0, condition: { type: "class_match", value: "Sem interesse" } },
    ],
  };
}

function usuario() {
  return userEvent.setup({ delay: null });
}

beforeEach(() => {
  postMock.mockReset();
});

describe("SimulatorPanel", () => {
  it("ao abrir, corre a rajada inicial e mostra a mensagem simulada da ação, parado no wait", async () => {
    const onActiveNodeChange = vi.fn();
    render(
      <SimulatorPanel flowId="fluxo-1" graph={graphSimples()} onActiveNodeChange={onActiveNodeChange} onClose={() => {}} />,
    );

    expect(await screen.findByText("Oi! Tudo bem?")).toBeInTheDocument();
    await waitFor(() => expect(onActiveNodeChange).toHaveBeenLastCalledWith("w1"));
    expect(screen.getByTestId("simulator-input")).toBeEnabled();
  });

  it("digitar e enviar avança a simulação até o Fim", async () => {
    const onActiveNodeChange = vi.fn();
    render(
      <SimulatorPanel flowId="fluxo-1" graph={graphSimples()} onActiveNodeChange={onActiveNodeChange} onClose={() => {}} />,
    );
    await screen.findByText("Oi! Tudo bem?");

    const user = usuario();
    await user.type(screen.getByTestId("simulator-input"), "oi de volta");
    await user.click(screen.getByTestId("simulator-enviar"));

    expect(await screen.findByTestId("simulator-fim")).toHaveTextContent("Fluxo concluído.");
    expect(screen.getByText("oi de volta")).toBeInTheDocument();
    await waitFor(() => expect(onActiveNodeChange).toHaveBeenLastCalledWith("fim"));
    expect(screen.getByTestId("simulator-input")).toBeDisabled();
  });

  it("'sem resposta / prazo esgotado' também avança, sem digitar nada", async () => {
    render(<SimulatorPanel flowId="fluxo-1" graph={graphSimples()} onActiveNodeChange={() => {}} onClose={() => {}} />);
    await screen.findByText("Oi! Tudo bem?");

    await usuario().click(screen.getByTestId("simulator-sem-resposta"));

    expect(await screen.findByText("(simulação: sem resposta — prazo esgotado)")).toBeInTheDocument();
    expect(await screen.findByTestId("simulator-fim")).toBeInTheDocument();
  });

  it("reiniciar limpa o transcript e roda a rajada inicial de novo", async () => {
    render(<SimulatorPanel flowId="fluxo-1" graph={graphSimples()} onActiveNodeChange={() => {}} onClose={() => {}} />);
    await screen.findByText("Oi! Tudo bem?");
    await usuario().click(screen.getByTestId("simulator-sem-resposta"));
    await screen.findByTestId("simulator-fim");

    await usuario().click(screen.getByTestId("simulator-reiniciar"));

    await waitFor(() => expect(screen.queryByTestId("simulator-fim")).toBeNull());
    expect(await screen.findByText("Oi! Tudo bem?")).toBeInTheDocument();
  });

  it("grafo sem Gatilho único mostra o erro inicial e não deixa responder", async () => {
    const semGatilho: FlowGraph = {
      nodes: [{ id: "fim", type: "end", label: "Fim", position: POS, config: { outcome: "converted" } }],
      edges: [],
    };
    render(<SimulatorPanel flowId="fluxo-1" graph={semGatilho} onActiveNodeChange={() => {}} onClose={() => {}} />);

    expect(await screen.findByTestId("simulator-erro-inicial")).toHaveTextContent("Gatilho");
    expect(screen.getByTestId("simulator-input")).toBeDisabled();
  });

  it("botão Fechar chama onClose", async () => {
    const onClose = vi.fn();
    render(<SimulatorPanel flowId="fluxo-1" graph={graphSimples()} onActiveNodeChange={() => {}} onClose={onClose} />);
    await screen.findByText("Oi! Tudo bem?");

    await usuario().click(screen.getByRole("button", { name: "Fechar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ai_classify chama a rota real de classificação com o texto digitado e as classes do nó", async () => {
    postMock.mockResolvedValue({ data: { class: "Interessado" } });
    render(
      <SimulatorPanel flowId="fluxo-1" graph={graphComClassify()} onActiveNodeChange={() => {}} onClose={() => {}} />,
    );
    await waitFor(() => expect(screen.getByTestId("simulator-input")).toBeEnabled());

    const user = usuario();
    await user.type(screen.getByTestId("simulator-input"), "quero sim, me conta mais");
    await user.click(screen.getByTestId("simulator-enviar"));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "/api/v1/ai/followup-flows/fluxo-1/simulate-classify",
        expect.objectContaining({
          candidate_text: "quero sim, me conta mais",
          classes: ["Interessado", "Sem interesse"],
        }),
        expect.anything(),
      ),
    );
    expect(await screen.findByText("«Interessado»", { exact: false })).toBeInTheDocument();
    expect(await screen.findByTestId("simulator-fim")).toBeInTheDocument();
  });
});
