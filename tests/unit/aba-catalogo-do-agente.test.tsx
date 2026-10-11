/**
 * A ABA "CATÁLOGO" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o dono cadastra produtos como cartões (adiciona, preenche, reordena,
 * remove); a prévia mostra o bloco REAL que o agente vai ler; o servidor recebe o formato que o schema
 * aceita; a tela não manda o que o servidor recusaria (produto sem nome, valor ou link); o selo de "falta
 * o fluxo de entrega" é o que o servidor disse; e quem só lê (readOnly) não consegue salvar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ put: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { CatalogoDoAgente, paraCorpo } from "@/app/app/ai/agents/[id]/_components/CatalogoDoAgente";
import { catalogoSchema } from "@/lib/catalogo/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

const SONS = {
  nome: "Sons Vocálicos",
  preco_cents: 4500,
  link: "https://pay.exemplo.com/sons",
  entrega: "material",
  pede: [],
  espera_horas: 20,
  ativo: true,
};
const LEITURA = {
  nome: "Leitura de Tarot",
  preco_cents: 1990,
  link: "https://pay.exemplo.com/tarot",
  entrega: "conversa",
  pede: ["a pergunta"],
  espera_horas: 48,
  ativo: true,
};

function renderizar(config: Record<string, unknown> | null = {}, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CatalogoDoAgente agentId={AGENTE} config={config} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const previa = () => screen.getByTestId("previa-do-catalogo");
const adicionarProduto = () => fireEvent.click(screen.getByRole("button", { name: "Adicionar produto" }));

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { catalog: null, faltas: [] } });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Catálogo", () => {
  it("começa desligada, sem produto, e a prévia pede para preencher", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar este catálogo" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Nenhum produto ainda/)).toBeInTheDocument();
    expect(previa()).toHaveTextContent("Preencha os campos");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("cadastrar um produto: a prévia mostra o bloco REAL e o servidor recebe o formato do schema", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar este catálogo" }));
    adicionarProduto();
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Leitura de Tarot" } });
    fireEvent.change(screen.getByLabelText("Valor (R$)"), { target: { value: "19,90" } });
    fireEvent.change(screen.getByLabelText("Link de pagamento"), { target: { value: "https://pay.exemplo.com/tarot" } });
    fireEvent.change(screen.getByLabelText("O que é"), { target: { value: "Uma pergunta, três cartas." } });
    fireEvent.click(screen.getByRole("radio", { name: "Na conversa" }));
    const pede = screen.getByLabelText("O que pedir à pessoa antes de entregar");
    fireEvent.change(pede, { target: { value: "a pergunta" } });
    fireEvent.keyDown(pede, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Oferecer depois da compra de"), { target: { value: "Abertura do Coração" } });
    fireEvent.change(screen.getByLabelText("Espera (horas)"), { target: { value: "48" } });

    // A prévia é o bloco que o agente recebe — não um resumo escrito para a tela.
    expect(previa()).toHaveTextContent("Leitura de Tarot — Uma pergunta, três cartas.");
    expect(previa()).toHaveTextContent("R$ 19,90");
    expect(previa()).toHaveTextContent("https://pay.exemplo.com/tarot");
    expect(previa()).toHaveTextContent("ANTES de entregar, você precisa de: a pergunta");
    expect(previa()).not.toHaveTextContent("Desligada");

    fireEvent.click(screen.getByRole("button", { name: "Salvar catálogo" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    const [url, corpo] = api.put.mock.calls[0]!;
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/catalogo`);
    expect(catalogoSchema.safeParse(corpo).success).toBe(true);
    expect(corpo).toEqual({
      enabled: true,
      produtos: [
        {
          nome: "Leitura de Tarot",
          descricao: "Uma pergunta, três cartas.",
          preco_cents: 1990,
          link: "https://pay.exemplo.com/tarot",
          entrega: "conversa",
          pede: ["a pergunta"],
          depois_de: "Abertura do Coração",
          espera_horas: 48,
          ativo: true,
        },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith("Catálogo salvo. Vale a partir da próxima conversa.");
  });

  it.each([
    ["sem nome", { nome: "" }, "Dê um nome a cada produto."],
    ["sem valor", { preco: "" }, "Informe o valor de cada produto."],
    ["sem link", { link: "" }, "Informe o link de pagamento de cada produto."],
    ["com espera que não é número inteiro", { horas: "1,5" }, "A espera é um número inteiro de horas."],
  ])("produto %s não vai ao servidor", (_nome, over, erro) => {
    const base = {
      nome: "Sons",
      descricao: "",
      recebe: "",
      preco: "45,00",
      link: "https://pay.exemplo.com/sons",
      entrega: "material" as const,
      pede: [],
      depoisDe: "",
      horas: "20",
      ativo: true,
    };
    expect(paraCorpo({ enabled: true, produtos: [{ ...base, ...over }] })).toEqual({ erro });
  });

  it("o que o servidor recusaria vira aviso na tela, sem chamada", async () => {
    renderizar({ catalog: { enabled: true, produtos: [SONS] } });
    fireEvent.change(screen.getByLabelText("Link de pagamento"), { target: { value: "http://pay.exemplo.com/sons" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar catálogo" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("o link precisa ser https"));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("abre com o que já foi salvo, e Subir troca a ordem — que é a prioridade da oferta", async () => {
    renderizar({ catalog: { enabled: true, produtos: [SONS, LEITURA] } });
    expect(within(screen.getByTestId("catalogo-produto-0")).getByLabelText("Nome do produto")).toHaveValue("Sons Vocálicos");
    expect(within(screen.getByTestId("catalogo-produto-0")).getByLabelText("Valor (R$)")).toHaveValue("45,00");
    expect(previa()).toHaveTextContent("Sons Vocálicos");

    fireEvent.click(within(screen.getByTestId("catalogo-produto-1")).getByRole("button", { name: "Subir" }));
    expect(within(screen.getByTestId("catalogo-produto-0")).getByLabelText("Nome do produto")).toHaveValue("Leitura de Tarot");
    expect(previa()).toHaveTextContent("Leitura de Tarot");

    fireEvent.click(screen.getByRole("button", { name: "Salvar catálogo" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const corpo = api.put.mock.calls[0]![1] as { produtos: Array<{ nome: string }> };
    expect(corpo.produtos.map((p) => p.nome)).toEqual(["Leitura de Tarot", "Sons Vocálicos"]);
  });

  it("o selo de falta é o que o SERVIDOR disse, no produto certo", async () => {
    api.get.mockResolvedValue({
      data: { catalog: { enabled: true, produtos: [SONS, LEITURA] }, faltas: ["sem_fluxo_de_entrega", null] },
    });
    renderizar({ catalog: { enabled: true, produtos: [SONS, LEITURA] } });

    expect(await screen.findByTestId("catalogo-produto-0-falta")).toHaveTextContent("Falta o fluxo de entrega");
    expect(screen.queryByTestId("catalogo-produto-1-falta")).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith(`/api/v1/ai/agents/${AGENTE}/catalogo`);
  });

  it("desligar o produto marca rascunho e o tira da prévia", () => {
    renderizar({ catalog: { enabled: true, produtos: [SONS] } });
    fireEvent.click(screen.getByRole("switch", { name: "O agente pode oferecer este produto" }));

    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(previa()).toHaveTextContent("Preencha os campos");
  });

  it("remover tira o cartão", () => {
    renderizar({ catalog: { enabled: true, produtos: [SONS, LEITURA] } });
    fireEvent.click(within(screen.getByTestId("catalogo-produto-0")).getByRole("button", { name: "Remover" }));

    expect(screen.queryByTestId("catalogo-produto-1")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("catalogo-produto-0")).getByLabelText("Nome do produto")).toHaveValue("Leitura de Tarot");
  });

  it("quem só lê não tem Salvar nem Adicionar, e os campos estão travados", () => {
    renderizar({ catalog: { enabled: true, produtos: [SONS] } }, true);

    expect(screen.queryByRole("button", { name: "Salvar catálogo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar produto" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome do produto")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Usar este catálogo" })).toBeDisabled();
  });
});
