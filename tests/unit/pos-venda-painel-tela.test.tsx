import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

import { PosVendaPainel } from "@/app/app/dashboard/_components/PosVendaPainel";

function responde(painel: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: { painel } }), { status, headers: { "content-type": "application/json" } })),
  );
}

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PosVendaPainel period="7d" tagDoIdioma="pt-BR" />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("painel Pós-venda", () => {
  it("mostra a receita média, a do período e a linha de cada produto", async () => {
    responde({
      produtos: [
        { nome: "Oração dos Sonhos", precoCentavos: 3500, oferecidas: 12, pediramLink: 5, compras: 3, receitaCentavos: 10500 },
        { nome: "Abertura da Prosperidade", precoCentavos: 6000, oferecidas: 4, pediramLink: 1, compras: 1, receitaCentavos: 6000 },
      ],
      ofertasRepetidasNoDia: 0,
      clientesQuePagaram: 45,
      receitaDeSempreCentavos: 450000,
      receitaMediaPorClienteCentavos: 10000,
      cortado: false,
    });
    renderizar();
    expect(await screen.findByTestId("pos-venda-media")).toHaveTextContent("R$ 100,00");
    expect(screen.getByText("R$ 165,00")).toBeInTheDocument();
    const linha = screen.getByText("Oração dos Sonhos").closest("tr")!;
    expect(linha).toHaveTextContent("12");
    expect(linha).toHaveTextContent("5");
    expect(linha).toHaveTextContent("R$ 105,00");
    expect(screen.queryByTestId("pos-venda-repetida")).toBeNull();
  });

  it("sem catálogo ligado, diz onde cadastrar em vez de mostrar zeros", async () => {
    responde(null);
    renderizar();
    expect(await screen.findByText(/Nenhum agente com catálogo ligado/)).toBeInTheDocument();
  });

  it("oferta repetida no mesmo dia aparece como alerta", async () => {
    responde({
      produtos: [],
      ofertasRepetidasNoDia: 2,
      clientesQuePagaram: 1,
      receitaDeSempreCentavos: 0,
      receitaMediaPorClienteCentavos: 0,
      cortado: false,
    });
    renderizar();
    expect(await screen.findByTestId("pos-venda-repetida")).toHaveTextContent("2");
  });

  it("quem não é gerente vê o motivo, não um erro genérico", async () => {
    responde(null, 403);
    renderizar();
    expect(await screen.findByRole("alert")).toHaveTextContent("A receita é visível para gerentes e administradores.");
  });
});
