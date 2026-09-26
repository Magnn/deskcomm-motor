/**
 * A ABA "LIMITES" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o dono lista o que o agente nunca diz e os assuntos que não discute (à mão ou
 * por atalho); a prévia mostra o bloco REAL que o agente vai ler (a mesma função do turno); o servidor recebe
 * o formato que o schema aceita; a tela não deixa entrar o que o servidor recusaria (ponto e vírgula, aspas
 * duplas, item comprido demais); e quem só lê (readOnly) não consegue salvar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { LimitesDoAgente, paraCorpo } from "@/app/app/ai/agents/[id]/_components/LimitesDoAgente";
import { MAX_NUNCA_DIZ, SUGESTOES_DE_ASSUNTOS, SUGESTOES_NUNCA_DIZ, limitesSchema } from "@/lib/limites/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

function renderizar(config: Record<string, unknown> | null = {}, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LimitesDoAgente agentId={AGENTE} config={config} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const previa = () => screen.getByTestId("previa-dos-limites");
const chipsNunca = () => screen.getByTestId("limites-nunca-diz-chips");
const chipsAssuntos = () => screen.getByTestId("limites-assuntos-chips");
function digitar(rotulo: string, texto: string) {
  const campo = screen.getByLabelText(rotulo);
  fireEvent.change(campo, { target: { value: texto } });
  fireEvent.keyDown(campo, { key: "Enter" });
}

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Limites", () => {
  it("começa desligada, vazia, com os atalhos à vista, e a prévia pede para preencher", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar estes limites" })).toHaveAttribute("aria-checked", "false");
    expect(within(screen.getByTestId("sugestoes-nunca-diz")).getByRole("button", { name: SUGESTOES_NUNCA_DIZ.resultado })).toBeInTheDocument();
    expect(within(screen.getByTestId("sugestoes-assuntos")).getByRole("button", { name: SUGESTOES_DE_ASSUNTOS.politica })).toBeInTheDocument();
    expect(previa()).toHaveTextContent("Preencha os campos");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("digitar itens e usar atalhos: a prévia mostra o bloco REAL e o servidor recebe o formato do schema", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar estes limites" }));
    digitar("Nunca diz nem promete", "prazo de entrega fora da oferta");
    fireEvent.click(within(screen.getByTestId("sugestoes-nunca-diz")).getByRole("button", { name: "garantia de resultado" }));
    fireEvent.click(within(screen.getByTestId("sugestoes-assuntos")).getByRole("button", { name: "política" }));

    // O atalho usado some da lista.
    expect(within(screen.getByTestId("sugestoes-nunca-diz")).queryByRole("button", { name: "garantia de resultado" })).not.toBeInTheDocument();

    // A prévia é o bloco que o agente recebe — não um resumo escrito para a tela.
    expect(previa()).toHaveTextContent("- Nunca diga nem prometa: prazo de entrega fora da oferta; garantia de resultado.");
    expect(previa()).toHaveTextContent("- Não discuta estes assuntos: política.");
    expect(previa()).toHaveTextContent("ofereça chamar uma pessoa da equipe");
    expect(previa()).not.toHaveTextContent("Desligada");

    fireEvent.click(screen.getByRole("button", { name: "Salvar limites" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    const [url, corpo] = api.put.mock.calls[0]!;
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/limites`);
    expect(corpo).toEqual({
      enabled: true,
      nunca_diz: ["prazo de entrega fora da oferta", "garantia de resultado"],
      evita_assuntos: ["política"],
    });
    // O que a tela manda passa no MESMO schema que o servidor usa.
    expect(limitesSchema.safeParse(corpo).success).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Limites salvos. Valem a partir da próxima conversa.");
  });

  it("remover um chip tira só aquele item, e a prévia acompanha", () => {
    renderizar({ limits: { enabled: true, nunca_diz: ["a", "b"], evita_assuntos: [] } });
    expect(previa()).toHaveTextContent("- Nunca diga nem prometa: a; b.");
    fireEvent.click(within(chipsNunca()).getByRole("button", { name: /a$/ }));
    expect(previa()).toHaveTextContent("- Nunca diga nem prometa: b.");
  });

  it("carrega o que já estava gravado, inclusive de limites desligados", () => {
    renderizar({ limits: { enabled: false, nunca_diz: ["prazo"], evita_assuntos: ["política"] } });
    expect(screen.getByRole("switch", { name: "Usar estes limites" })).toHaveAttribute("aria-checked", "false");
    expect(within(chipsNunca()).getByText("prazo")).toBeInTheDocument();
    expect(within(chipsAssuntos()).getByText("política")).toBeInTheDocument();
    // o atalho de um assunto que já existe some
    expect(within(screen.getByTestId("sugestoes-assuntos")).queryByRole("button", { name: "política" })).not.toBeInTheDocument();
    // desligada, a prévia ainda mostra o que passaria a valer
    expect(previa()).toHaveTextContent("- Nunca diga nem prometa: prazo.");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("um jsonb quebrado abre a tela vazia, sem exceção", () => {
    expect(() => renderizar({ limits: { nunca_diz: 42 } })).not.toThrow();
    expect(previa()).toHaveTextContent("Preencha os campos");
  });
});

describe("as listas (chips)", () => {
  it("a tela não deixa entrar o que o servidor recusaria: ponto e vírgula, aspas duplas e texto comprido", () => {
    renderizar({});
    const campo = screen.getByLabelText("Nunca diz nem promete");
    for (const proibido of ["entrega; frete", 'um "prazo"', "x".repeat(121)]) {
      fireEvent.change(campo, { target: { value: proibido } });
      fireEvent.keyDown(campo, { key: "Enter" });
    }
    expect(chipsNunca()).toBeEmptyDOMElement();

    digitar("Nunca diz nem promete", "garantia de resultado");
    expect(within(chipsNunca()).getByText("garantia de resultado")).toBeInTheDocument();
  });

  it("'nunca diz' para em 12 itens: o campo trava e os atalhos somem", () => {
    renderizar({});
    for (let i = 0; i < MAX_NUNCA_DIZ; i++) digitar("Nunca diz nem promete", `item ${i}`);
    expect(screen.getByLabelText("Nunca diz nem promete")).toBeDisabled();
    expect(screen.queryByTestId("sugestoes-nunca-diz")).not.toBeInTheDocument();
  });
});

describe("quem só lê", () => {
  it("readOnly: sem botão de salvar nem atalhos, e com tudo desabilitado", () => {
    renderizar({ limits: { enabled: true, nunca_diz: ["prazo"], evita_assuntos: [] } }, true);
    expect(screen.queryByRole("button", { name: "Salvar limites" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("sugestoes-nunca-diz")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sugestoes-assuntos")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nunca diz nem promete")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Usar estes limites" })).toBeDisabled();
  });
});

describe("paraCorpo", () => {
  it("aceita o formulário mínimo (as duas listas vazias)", () => {
    const r = paraCorpo({ enabled: true, nuncaDiz: [], evitaAssuntos: [] });
    expect("corpo" in r && r.corpo).toEqual({ enabled: true, nunca_diz: [], evita_assuntos: [] });
  });

  it("recusa item que o servidor recusaria, com a frase legível", () => {
    const r = paraCorpo({ enabled: true, nuncaDiz: ["a; b"], evitaAssuntos: [] });
    expect("erro" in r && r.erro).toContain("sem aspas duplas, ponto e vírgula nem quebra de linha");
  });
});
