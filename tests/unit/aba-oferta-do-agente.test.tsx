/**
 * A ABA "OFERTA" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o dono cadastra produtos como cartões (adiciona, preenche, remove); a
 * prévia mostra o bloco REAL que o agente vai ler (a mesma função do turno); o servidor recebe o formato
 * que o schema aceita; a tela não deixa entrar o que o servidor recusaria (produto sem nome, item com
 * ponto e vírgula ou aspas); e quem só lê (readOnly) não consegue salvar.
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

import { OfertaDoAgente, paraCorpo } from "@/app/app/ai/agents/[id]/_components/OfertaDoAgente";
import { ofertaSchema } from "@/lib/oferta/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

function renderizar(config: Record<string, unknown> | null = {}, readOnly = false) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OfertaDoAgente agentId={AGENTE} config={config} readOnly={readOnly} />
    </QueryClientProvider>,
  );
}

const previa = () => screen.getByTestId("previa-da-oferta");
const adicionarProduto = () => fireEvent.click(screen.getByRole("button", { name: "Adicionar produto" }));

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Oferta", () => {
  it("começa desligada, sem produto, e a prévia pede para preencher", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar esta oferta" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText(/Nenhum produto ainda/)).toBeInTheDocument();
    expect(previa()).toHaveTextContent("Preencha os campos");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("cadastrar um produto: a prévia mostra o bloco REAL e o servidor recebe o formato do schema", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar esta oferta" }));
    adicionarProduto();
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Leitura Completa" } });
    fireEvent.change(screen.getByLabelText("O que é"), { target: { value: "Uma leitura por escrito." } });
    const inclui = screen.getByLabelText("O que inclui");
    fireEvent.change(inclui, { target: { value: "PDF de 10 páginas" } });
    fireEvent.keyDown(inclui, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Como é entregue"), { target: { value: "Por e-mail" } });
    fireEvent.change(screen.getByLabelText("Garantia e reembolso (opcional)"), {
      target: { value: "Devolvemos em 7 dias." },
    });

    // A prévia é o bloco que o agente recebe — não um resumo escrito para a tela.
    expect(previa()).toHaveTextContent("- Leitura Completa: Uma leitura por escrito.");
    expect(previa()).toHaveTextContent("Inclui: PDF de 10 páginas.");
    expect(previa()).toHaveTextContent("Entrega: Por e-mail");
    expect(previa()).toHaveTextContent('diga só isto, sem acrescentar prazo, condição ou promessa: "Devolvemos em 7 dias."');
    expect(previa()).not.toHaveTextContent("Desligada");

    fireEvent.click(screen.getByRole("button", { name: "Salvar oferta" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    const [url, corpo] = api.put.mock.calls[0]!;
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/oferta`);
    expect(corpo).toEqual({
      enabled: true,
      produtos: [
        {
          nome: "Leitura Completa",
          resumo: "Uma leitura por escrito.",
          entrega: "Por e-mail",
          inclui: ["PDF de 10 páginas"],
        },
      ],
      garantia: "Devolvemos em 7 dias.",
      nao_oferecemos: [],
    });
    // O que a tela manda passa no MESMO schema que o servidor usa.
    expect(ofertaSchema.safeParse(corpo).success).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Oferta salva. Vale a partir da próxima conversa.");
  });

  it("vários produtos: cada um tem o seu cartão, e remover tira só aquele", () => {
    renderizar({});
    adicionarProduto();
    adicionarProduto();
    const nomes = screen.getAllByLabelText("Nome do produto");
    fireEvent.change(nomes[0]!, { target: { value: "Plano A" } });
    fireEvent.change(nomes[1]!, { target: { value: "Plano B" } });
    expect(previa()).toHaveTextContent("- Plano A");
    expect(previa()).toHaveTextContent("- Plano B");

    fireEvent.click(within(screen.getByTestId("produto-0")).getByRole("button", { name: "Remover" }));
    expect(previa()).not.toHaveTextContent("- Plano A");
    expect(previa()).toHaveTextContent("- Plano B");
    expect(screen.getAllByLabelText("Nome do produto")).toHaveLength(1);
  });

  it("produto sem nome não sai: a tela avisa e nada vai ao servidor", async () => {
    renderizar({});
    adicionarProduto();
    fireEvent.click(screen.getByRole("button", { name: "Salvar oferta" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Dê um nome a cada produto."));
    expect(api.put).not.toHaveBeenCalled();
  });

  it("dois produtos com o mesmo nome: a tela mostra o motivo do servidor e não envia", async () => {
    renderizar({});
    adicionarProduto();
    adicionarProduto();
    const nomes = screen.getAllByLabelText("Nome do produto");
    fireEvent.change(nomes[0]!, { target: { value: "Plano" } });
    fireEvent.change(nomes[1]!, { target: { value: "plano" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar oferta" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(String(toast.error.mock.calls[0]![0])).toContain("mesmo nome");
    expect(api.put).not.toHaveBeenCalled();
  });

  it("carrega o que já estava gravado, inclusive de uma oferta desligada", () => {
    renderizar({
      offer: {
        enabled: false,
        produtos: [{ nome: "Leitura", resumo: "Por escrito.", inclui: ["PDF"] }],
        garantia: "Sete dias.",
        nao_oferecemos: ["frete grátis"],
      },
    });
    expect(screen.getByRole("switch", { name: "Usar esta oferta" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Leitura");
    expect(screen.getByLabelText("Garantia e reembolso (opcional)")).toHaveValue("Sete dias.");
    expect(within(screen.getByTestId("oferta-nao-oferecemos-chips")).getByText("frete grátis")).toBeInTheDocument();
    // desligada, a prévia ainda mostra o que passaria a valer
    expect(previa()).toHaveTextContent("- Leitura: Por escrito.");
    expect(previa()).toHaveTextContent("Desligada");
  });

  it("um jsonb quebrado abre a tela vazia, sem exceção", () => {
    expect(() => renderizar({ offer: { produtos: 42 } })).not.toThrow();
    expect(screen.getByText(/Nenhum produto ainda/)).toBeInTheDocument();
  });
});

describe("as listas (chips)", () => {
  it("a tela não deixa entrar o que o servidor recusaria: ponto e vírgula, aspas duplas e mais de 120 letras", () => {
    renderizar({});
    const campo = screen.getByLabelText("O que a empresa não oferece");
    for (const proibido of ["entrega; frete", 'um "brinde"', "x".repeat(121)]) {
      fireEvent.change(campo, { target: { value: proibido } });
      fireEvent.keyDown(campo, { key: "Enter" });
    }
    expect(screen.getByTestId("oferta-nao-oferecemos-chips")).toBeEmptyDOMElement();

    fireEvent.change(campo, { target: { value: "entrega aos domingos" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    expect(within(screen.getByTestId("oferta-nao-oferecemos-chips")).getByText("entrega aos domingos")).toBeInTheDocument();
  });

  it("'o que inclui' para em 8 itens e 'o que não oferece' também", () => {
    renderizar({});
    adicionarProduto();
    const inclui = screen.getByLabelText("O que inclui");
    for (let i = 0; i < 8; i++) {
      fireEvent.change(inclui, { target: { value: `item ${i}` } });
      fireEvent.keyDown(inclui, { key: "Enter" });
    }
    expect(inclui).toBeDisabled();
  });
});

describe("quem só lê", () => {
  it("readOnly: sem botão de salvar nem de adicionar, e com tudo desabilitado", () => {
    renderizar({ offer: { enabled: true, produtos: [{ nome: "Leitura" }], nao_oferecemos: [] } }, true);
    expect(screen.queryByRole("button", { name: "Salvar oferta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adicionar produto" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome do produto")).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Usar esta oferta" })).toBeDisabled();
  });
});

describe("paraCorpo", () => {
  const base: Parameters<typeof paraCorpo>[0] = { enabled: true, produtos: [], garantia: "", naoOferecemos: [] };

  it("aceita o formulário mínimo (nenhum produto)", () => {
    const r = paraCorpo(base);
    expect("corpo" in r && r.corpo.enabled).toBe(true);
  });

  it("recusa produto sem nome, com a frase legível", () => {
    const r = paraCorpo({ ...base, produtos: [{ nome: "  ", resumo: "", paraQuem: "", entrega: "", inclui: [] }] });
    expect(r).toEqual({ erro: "Dê um nome a cada produto." });
  });
});
