/**
 * A ABA "PREÇO" FAZ O QUE PROMETE — provada pela tela.
 *
 * O que ela precisa garantir: o operador digita reais e o servidor recebe centavos; o valor de
 * referência só sai com a declaração de que é real; o degrau sem cupom nem link não sai; o
 * mínimo mostrado é o do último degrau; e o que a tela grava passa no schema que o servidor usa.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { PrecoDoAgente } from "@/app/app/ai/agents/[id]/_components/PrecoDoAgente";
import { pricingSchema } from "@/lib/preco/tipos";

const AGENTE = "11111111-1111-4111-8111-111111111111";

function renderizar(config: Record<string, unknown> | null = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PrecoDoAgente agentId={AGENTE} config={config} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  api.put.mockReset();
  api.put.mockResolvedValue({ data: {} });
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => cleanup());

describe("aba Preço", () => {
  it("começa desligada, vazia, sem degraus", () => {
    renderizar({});
    expect(screen.getByRole("switch", { name: "Usar esta política de preço" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("resumo-do-preco")).toHaveTextContent("Preencha os valores");
  });

  it("valor + referência real + 2 degraus: o servidor recebe centavos e o mínimo mostrado é o último degrau", async () => {
    renderizar({});
    fireEvent.click(screen.getByRole("switch", { name: "Usar esta política de preço" }));
    fireEvent.change(screen.getByLabelText("Valor de venda (R$)"), { target: { value: "130,00" } });
    fireEvent.change(screen.getByLabelText("Valor de referência (R$, opcional)"), { target: { value: "260" } });
    fireEvent.click(screen.getByRole("checkbox"));

    fireEvent.click(screen.getByRole("button", { name: "Adicionar degrau" }));
    fireEvent.change(screen.getByLabelText("Valor (R$)"), { target: { value: "110" } });
    fireEvent.change(screen.getByLabelText("Cupom no checkout"), { target: { value: "CUPOM110" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar degrau" }));
    const valores = screen.getAllByLabelText("Valor (R$)");
    fireEvent.change(valores[1]!, { target: { value: "100" } });
    fireEvent.change(screen.getAllByLabelText("ou link que cobra este valor")[1]!, {
      target: { value: "https://pay.cakto.com.br/abc_100" },
    });

    expect(screen.getByTestId("resumo-do-preco")).toHaveTextContent("Mínimo que a agente aceita: R$ 100.");

    fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [url, corpo] = api.put.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe(`/api/v1/ai/agents/${AGENTE}/pricing`);
    expect(corpo).toMatchObject({
      enabled: true,
      list_price_cents: 13_000,
      anchor_price_cents: 26_000,
      anchor_is_real: true,
      steps: [
        { price_cents: 11_000, coupon_code: "CUPOM110" },
        { price_cents: 10_000, payment_url: "https://pay.cakto.com.br/abc_100" },
      ],
    });
    // O contrato: o que a tela grava passa no schema do servidor.
    expect(pricingSchema.safeParse(corpo).success).toBe(true);
  });

  it("referência sem a confirmação de que é real NÃO sai", async () => {
    renderizar({});
    fireEvent.change(screen.getByLabelText("Valor de venda (R$)"), { target: { value: "130" } });
    fireEvent.change(screen.getByLabelText("Valor de referência (R$, opcional)"), { target: { value: "260" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("degrau sem cupom nem link NÃO sai", async () => {
    renderizar({});
    fireEvent.change(screen.getByLabelText("Valor de venda (R$)"), { target: { value: "130" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar degrau" }));
    fireEvent.change(screen.getByLabelText("Valor (R$)"), { target: { value: "110" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar preço" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(api.put).not.toHaveBeenCalled();
  });

  it("carrega o que já está salvo e deixa remover um degrau", () => {
    renderizar({
      pricing: {
        enabled: true,
        list_price_cents: 13_000,
        steps: [{ price_cents: 11_000, coupon_code: "CUPOM110" }],
      },
    });
    expect(screen.getByRole("switch", { name: "Usar esta política de preço" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByLabelText("Valor de venda (R$)")).toHaveValue("130,00");
    expect(screen.getByLabelText("Cupom no checkout")).toHaveValue("CUPOM110");
    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    expect(screen.queryByLabelText("Cupom no checkout")).not.toBeInTheDocument();
    expect(screen.getByTestId("resumo-do-preco")).toHaveTextContent("Mínimo que a agente aceita: R$ 130.");
  });
});
