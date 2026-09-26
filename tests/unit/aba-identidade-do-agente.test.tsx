/**
 * A ABA "IDENTIDADE" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o dono escolhe e preenche campos, e o servidor recebe o formato que o
 * schema aceita; a prévia mostra o bloco REAL que o agente vai ler (a mesma função do turno); o que se
 * escolhe pode ser desfeito; as palavras entram como chips e a tela não deixa entrar o que o servidor
 * recusaria; e quem só lê (readOnly) não consegue salvar.
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

import { IdentidadeDoAgente, paraCorpo } from "@/app/app/ai/agents/[id]/_components/IdentidadeDoAgente";
import { identidadeSchema } from "@/lib/identidade/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

function renderizar(config: Record<string, unknown> | null = {}, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IdentidadeDoAgente agentId={AGENTE} config={config} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const previa = () => screen.getByTestId("previa-da-identidade");

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Identidade", () => {
  it("começa desligada, vazia, e a prévia pede para preencher", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar esta identidade" })).toHaveAttribute("aria-checked", "false");
    expect(previa()).toHaveTextContent("Preencha os campos ao lado");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("o que o dono preenche vira o bloco REAL na prévia, e o servidor recebe o formato do schema", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar esta identidade" }));
    fireEvent.change(screen.getByLabelText("Como ele se chama"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Nome da empresa"), { target: { value: "Clínica Bem-Estar" } });
    fireEvent.click(screen.getByRole("radio", { name: /Acolhedor/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Você" }));
    fireEvent.click(screen.getByRole("radio", { name: "Nenhum" }));

    // A prévia é o bloco que o agente recebe — não um resumo escrito para a tela.
    expect(previa()).toHaveTextContent("- Você é Ana, da Clínica Bem-Estar.");
    expect(previa()).toHaveTextContent("- Tom: caloroso e paciente");
    expect(previa()).toHaveTextContent("- Não use emojis.");
    expect(previa()).not.toHaveTextContent("Desligada");

    fireEvent.click(screen.getByRole("button", { name: "Salvar identidade" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    const [url, corpo] = api.put.mock.calls[0]!;
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/identidade`);
    expect(corpo).toEqual({
      enabled: true,
      nome: "Ana",
      empresa: "Clínica Bem-Estar",
      tom: "acolhedor",
      tratamento: "voce",
      emojis: "nenhum",
      palavras_da_casa: [],
      palavras_a_evitar: [],
    });
    // O que a tela manda passa no MESMO schema que o servidor usa.
    expect(identidadeSchema.safeParse(corpo).success).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Identidade salva. Vale a partir da próxima conversa.");
  });

  it("campo em branco não vai ao servidor (é opcional), e uma escolha se desfaz clicando de novo", async () => {
    renderizar({});
    fireEvent.change(screen.getByLabelText("Como ele se chama"), { target: { value: "   " } });
    const direto = screen.getByRole("radio", { name: /Direto/ });
    fireEvent.click(direto);
    expect(direto).toHaveAttribute("aria-checked", "true");
    fireEvent.click(direto);
    expect(direto).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByRole("button", { name: "Salvar identidade" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    expect(api.put.mock.calls[0]![1]).toEqual({ enabled: false, palavras_da_casa: [], palavras_a_evitar: [] });
  });

  it("carrega o que já estava gravado, inclusive de uma identidade desligada", () => {
    renderizar({
      identity: {
        enabled: false,
        nome: "Ana",
        empresa: "Clínica",
        tom: "formal",
        palavras_da_casa: ["bem-vinda"],
        palavras_a_evitar: [],
      },
    });
    expect(screen.getByRole("switch", { name: "Usar esta identidade" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Como ele se chama")).toHaveValue("Ana");
    expect(screen.getByRole("radio", { name: /Formal/ })).toHaveAttribute("aria-checked", "true");
    expect(within(screen.getByTestId("identidade-palavras-da-casa-chips")).getByText("bem-vinda")).toBeInTheDocument();
    // desligada, a prévia ainda mostra o que passaria a valer
    expect(previa()).toHaveTextContent("- Você é Ana, da Clínica.");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("um jsonb quebrado abre a tela vazia, sem exceção", () => {
    expect(() => renderizar({ identity: { tom: 42 } })).not.toThrow();
    expect(screen.getByLabelText("Como ele se chama")).toHaveValue("");
  });
});

describe("as palavras da casa (chips)", () => {
  const campo = () => screen.getByLabelText("Palavras que a casa usa");
  const chips = () => screen.getByTestId("identidade-palavras-da-casa-chips");

  it("Enter adiciona; repetida não entra; remover tira", () => {
    renderizar({});
    fireEvent.change(campo(), { target: { value: "bem-vinda" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    fireEvent.change(campo(), { target: { value: "bem-vinda" } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    fireEvent.change(campo(), { target: { value: "cuidado" } });
    fireEvent.keyDown(campo(), { key: "," });
    expect(within(chips()).getAllByText(/bem-vinda|cuidado/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Remover bem-vinda" }));
    expect(within(chips()).queryByText("bem-vinda")).not.toBeInTheDocument();
    expect(within(chips()).getByText("cuidado")).toBeInTheDocument();
  });

  it("a tela não deixa entrar o que o servidor recusaria: aspas duplas e texto acima de 40 letras", () => {
    renderizar({});
    fireEvent.change(campo(), { target: { value: 'diga "olá"' } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    fireEvent.change(campo(), { target: { value: "x".repeat(41) } });
    fireEvent.keyDown(campo(), { key: "Enter" });
    expect(chips()).toBeEmptyDOMElement();
  });

  it("para em 10 palavras (o campo trava)", () => {
    renderizar({});
    for (let i = 0; i < 10; i++) {
      fireEvent.change(campo(), { target: { value: `p${i}` } });
      fireEvent.keyDown(campo(), { key: "Enter" });
    }
    expect(campo()).toBeDisabled();
  });
});

describe("quem só lê", () => {
  it("readOnly: sem botão de salvar e com tudo desabilitado", () => {
    renderizar({ identity: { enabled: true, nome: "Ana", palavras_da_casa: [], palavras_a_evitar: [] } }, true);
    expect(screen.queryByRole("button", { name: "Salvar identidade" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Como ele se chama")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Usar esta identidade" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Acolhedor/ })).toBeDisabled();
  });
});

describe("paraCorpo", () => {
  const base: Parameters<typeof paraCorpo>[0] = {
    enabled: true,
    nome: "",
    empresa: "",
    oQueFaz: "",
    publico: "",
    apresentacao: "",
    tom: null,
    tratamento: null,
    emojis: null,
    mensagens: null,
    palavrasDaCasa: [],
    palavrasAEvitar: [],
  };

  it("recusa, com uma frase legível, o que o schema do servidor recusa", () => {
    const r = paraCorpo({ ...base, nome: "x".repeat(61) });
    expect("erro" in r).toBe(true);
  });

  it("aceita o formulário mínimo", () => {
    const r = paraCorpo({ ...base });
    expect("corpo" in r && r.corpo.enabled).toBe(true);
  });
});
