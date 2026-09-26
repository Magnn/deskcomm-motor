/**
 * A ABA "OBJEÇÕES" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o dono cadastra objeções como cartões (por atalho ou do zero), preenche a frase
 * e a resposta, remove; a prévia mostra o bloco REAL que o agente vai ler (a mesma função do turno); o
 * servidor recebe o formato que o schema aceita; a tela não deixa sair o que o servidor recusaria (objeção
 * pela metade, valor em dinheiro na resposta, a mesma frase duas vezes); e quem só lê (readOnly) não salva.
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

import { ObjecoesDoAgente, paraCorpo } from "@/app/app/ai/agents/[id]/_components/ObjecoesDoAgente";
import { MAX_OBJECOES, MENSAGEM_FRASE_REPETIDA, MENSAGEM_SEM_DINHEIRO, SUGESTOES_DE_OBJECAO, objecoesSchema } from "@/lib/objecoes/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

function renderizar(config: Record<string, unknown> | null = {}, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ObjecoesDoAgente agentId={AGENTE} config={config} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const previa = () => screen.getByTestId("previa-das-objecoes");
const adicionar = () => fireEvent.click(screen.getByRole("button", { name: "Adicionar objeção" }));
const salvar = () => fireEvent.click(screen.getByRole("button", { name: "Salvar objeções" }));

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Objeções", () => {
  it("começa desligada, sem objeção, com os atalhos à vista, e a prévia pede para preencher", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar estas objeções" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Nenhuma objeção ainda/)).toBeInTheDocument();
    for (const frase of Object.values(SUGESTOES_DE_OBJECAO)) {
      expect(within(screen.getByTestId("sugestoes-de-objecao")).getByRole("button", { name: frase })).toBeInTheDocument();
    }
    expect(previa()).toHaveTextContent("Preencha os campos");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("um atalho cria o cartão com a frase pronta e some da lista; a resposta entra na prévia REAL e no que o servidor recebe", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar estas objeções" }));
    fireEvent.click(within(screen.getByTestId("sugestoes-de-objecao")).getByRole("button", { name: "Vou pensar" }));

    expect(screen.getByLabelText("Quando a pessoa diz")).toHaveValue("Vou pensar");
    expect(within(screen.getByTestId("sugestoes-de-objecao")).queryByRole("button", { name: "Vou pensar" })).not.toBeInTheDocument();
    // sem resposta ainda, a objeção pela metade não entra na prévia
    expect(previa()).toHaveTextContent("Preencha os campos");

    fireEvent.change(screen.getByLabelText("O que o agente responde"), { target: { value: "Sem pressa. Posso te mandar um resumo?" } });

    // A prévia é o bloco que o agente recebe — não um resumo escrito para a tela.
    expect(previa()).toHaveTextContent('- Se a pessoa disser algo como "Vou pensar": responda no sentido de "Sem pressa. Posso te mandar um resumo?"');
    expect(previa()).not.toHaveTextContent("Desligada");

    salvar();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    const [url, corpo] = api.put.mock.calls[0]!;
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/objecoes`);
    expect(corpo).toEqual({ enabled: true, objecoes: [{ quando: "Vou pensar", resposta: "Sem pressa. Posso te mandar um resumo?" }] });
    // O que a tela manda passa no MESMO schema que o servidor usa.
    expect(objecoesSchema.safeParse(corpo).success).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Objeções salvas. Valem a partir da próxima conversa.");
  });

  it("do zero: 'Adicionar objeção' abre um cartão vazio, e remover tira só aquele", () => {
    renderizar({});
    adicionar();
    adicionar();
    const frases = screen.getAllByLabelText("Quando a pessoa diz");
    const respostas = screen.getAllByLabelText("O que o agente responde");
    fireEvent.change(frases[0]!, { target: { value: "Primeira" } });
    fireEvent.change(respostas[0]!, { target: { value: "Resposta um." } });
    fireEvent.change(frases[1]!, { target: { value: "Segunda" } });
    fireEvent.change(respostas[1]!, { target: { value: "Resposta dois." } });
    expect(previa()).toHaveTextContent('"Primeira"');
    expect(previa()).toHaveTextContent('"Segunda"');

    fireEvent.click(within(screen.getByTestId("objecao-0")).getByRole("button", { name: "Remover" }));
    expect(previa()).not.toHaveTextContent('"Primeira"');
    expect(previa()).toHaveTextContent('"Segunda"');
    expect(screen.getAllByLabelText("Quando a pessoa diz")).toHaveLength(1);
  });

  it("objeção pela metade não sai: a tela avisa e nada vai ao servidor", async () => {
    renderizar({});
    adicionar();
    fireEvent.change(screen.getByLabelText("Quando a pessoa diz"), { target: { value: "Vou pensar" } });
    salvar();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Preencha a frase e a resposta de cada objeção."));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("valor em dinheiro na resposta: a tela mostra o motivo do servidor (e onde o preço mora) e não envia", async () => {
    renderizar({});
    adicionar();
    fireEvent.change(screen.getByLabelText("Quando a pessoa diz"), { target: { value: "Está caro" } });
    fireEvent.change(screen.getByLabelText("O que o agente responde"), { target: { value: "Fecho por R$ 80 hoje." } });
    salvar();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAGEM_SEM_DINHEIRO));
    expect(MENSAGEM_SEM_DINHEIRO).toContain("aba Preço");
    expect(api.put).not.toHaveBeenCalled();
  });

  it("a mesma frase duas vezes: a tela mostra o motivo e não envia", async () => {
    renderizar({});
    adicionar();
    adicionar();
    const frases = screen.getAllByLabelText("Quando a pessoa diz");
    const respostas = screen.getAllByLabelText("O que o agente responde");
    fireEvent.change(frases[0]!, { target: { value: "Vou pensar" } });
    fireEvent.change(respostas[0]!, { target: { value: "Um." } });
    fireEvent.change(frases[1]!, { target: { value: "vou PENSAR" } });
    fireEvent.change(respostas[1]!, { target: { value: "Dois." } });
    salvar();

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MENSAGEM_FRASE_REPETIDA));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("carrega o que já estava gravado, inclusive de objeções desligadas, e esconde o atalho da frase que já existe", () => {
    renderizar({
      objections: { enabled: false, objecoes: [{ quando: "Vou pensar", resposta: "Sem pressa." }] },
    });
    expect(screen.getByRole("switch", { name: "Usar estas objeções" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Quando a pessoa diz")).toHaveValue("Vou pensar");
    expect(screen.getByLabelText("O que o agente responde")).toHaveValue("Sem pressa.");
    expect(within(screen.getByTestId("sugestoes-de-objecao")).queryByRole("button", { name: "Vou pensar" })).not.toBeInTheDocument();
    // desligada, a prévia ainda mostra o que passaria a valer
    expect(previa()).toHaveTextContent('"Vou pensar"');
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("um jsonb quebrado abre a tela vazia, sem exceção", () => {
    expect(() => renderizar({ objections: { objecoes: 42 } })).not.toThrow();
    expect(screen.getByText(/Nenhuma objeção ainda/)).toBeInTheDocument();
  });

  it("no teto de objeções não há mais como adicionar, nem atalho", () => {
    renderizar({});
    for (let i = 0; i < MAX_OBJECOES; i++) adicionar();
    expect(screen.queryByRole("button", { name: "Adicionar objeção" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("sugestoes-de-objecao")).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Quando a pessoa diz")).toHaveLength(MAX_OBJECOES);
  });

  it("a resposta mostra o contador de letras", () => {
    renderizar({});
    adicionar();
    fireEvent.change(screen.getByLabelText("O que o agente responde"), { target: { value: "abcde" } });
    expect(screen.getByText("5/400")).toBeInTheDocument();
  });
});

describe("quem só lê", () => {
  it("readOnly: sem botão de salvar, de adicionar nem atalhos, e com tudo desabilitado", () => {
    renderizar({ objections: { enabled: true, objecoes: [{ quando: "Vou pensar", resposta: "Sem pressa." }] } }, true);
    expect(screen.queryByRole("button", { name: "Salvar objeções" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar objeção" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("sugestoes-de-objecao")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quando a pessoa diz")).toBeDisabled();
    expect(screen.getByLabelText("O que o agente responde")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Usar estas objeções" })).toBeDisabled();
  });
});

describe("paraCorpo", () => {
  const base: Parameters<typeof paraCorpo>[0] = { enabled: true, objecoes: [] };

  it("aceita o formulário mínimo (nenhuma objeção)", () => {
    const r = paraCorpo(base);
    expect("corpo" in r && r.corpo.enabled).toBe(true);
  });

  it("recusa objeção sem frase ou sem resposta, com a frase legível", () => {
    expect(paraCorpo({ ...base, objecoes: [{ quando: "  ", resposta: "x" }] })).toEqual({ erro: "Preencha a frase e a resposta de cada objeção." });
    expect(paraCorpo({ ...base, objecoes: [{ quando: "x", resposta: " " }] })).toEqual({ erro: "Preencha a frase e a resposta de cada objeção." });
  });

  it("apara os espaços das pontas", () => {
    const r = paraCorpo({ ...base, objecoes: [{ quando: "  Vou pensar ", resposta: " Sem pressa. " }] });
    expect("corpo" in r && r.corpo.objecoes).toEqual([{ quando: "Vou pensar", resposta: "Sem pressa." }]);
  });
});
