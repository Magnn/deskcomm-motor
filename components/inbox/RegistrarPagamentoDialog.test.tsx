import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { centavosDoTexto, RegistrarPagamentoDialog } from "./RegistrarPagamentoDialog";

/**
 * O diálogo do pagamento recebido por fora do checkout. O que ele segura:
 *  - com um produto só, ele já vem escolhido e o valor preenchido;
 *  - o valor digitado vira centavos, e valor que não é valor não sai;
 *  - a chave do registro vai junto, e a entrega automática só vai ligada se a pessoa ligar.
 */

const enviar = vi.hoisted(() => vi.fn());
const sugestoes = vi.hoisted(() => ({ atual: [] as Array<{ produto: string; valor_cents: number }> }));

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/inbox/useRegistrarPagamento", () => ({
  useSugestoesDePagamento: () => ({ data: sugestoes.atual, isLoading: false }),
  useRegistrarPagamento: () => ({ mutate: enviar, isPending: false }),
}));

beforeEach(() => {
  enviar.mockReset();
  sugestoes.atual = [{ produto: "Abertura do Coração", valor_cents: 13000 }];
});

describe("centavosDoTexto", () => {
  it.each([
    ["130", 13000],
    ["130,00", 13000],
    ["130.5", 13050],
    ["1.300,50", 130050],
    ["R$ 45", 4500],
  ])("%s → %i centavos", (texto, cents) => {
    expect(centavosDoTexto(texto)).toBe(cents);
  });

  it.each(["", "abc", "0", "13,000", "12,345"])("%j não é um valor", (texto) => {
    expect(centavosDoTexto(texto)).toBeNull();
  });
});

describe("RegistrarPagamentoDialog", () => {
  it("⭐ com um produto só, ele vem escolhido com o valor, e o registro sai em centavos com a chave", async () => {
    render(<RegistrarPagamentoDialog conversationId="conv-1" open onOpenChange={() => undefined} />);

    const valor = await screen.findByTestId("pagamento-valor");
    expect(valor).toHaveValue("130,00");
    await userEvent.click(screen.getByTestId("pagamento-confirmar"));

    expect(enviar).toHaveBeenCalledTimes(1);
    const args = enviar.mock.calls[0]![0];
    expect(args.conversation_id).toBe("conv-1");
    expect(args.pagamento).toMatchObject({ produto: "Abertura do Coração", valor_cents: 13000, metodo: "pix", iniciar_entrega: false });
    expect(args.pagamento.chave).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("valor corrigido à mão é o que sai; valor inválido trava o botão", async () => {
    render(<RegistrarPagamentoDialog conversationId="conv-1" open onOpenChange={() => undefined} />);
    const valor = await screen.findByTestId("pagamento-valor");

    await userEvent.clear(valor);
    await userEvent.type(valor, "abc");
    expect(screen.getByTestId("pagamento-confirmar")).toBeDisabled();

    await userEvent.clear(valor);
    await userEvent.type(valor, "90");
    await userEvent.click(screen.getByTestId("pagamento-confirmar"));
    expect(enviar.mock.calls[0]![0].pagamento.valor_cents).toBe(9000);
  });

  it("a entrega automática só vai ligada quando a pessoa liga", async () => {
    render(<RegistrarPagamentoDialog conversationId="conv-1" open onOpenChange={() => undefined} />);
    await screen.findByTestId("pagamento-valor");
    await userEvent.click(screen.getByTestId("pagamento-entrega"));
    await userEvent.click(screen.getByTestId("pagamento-confirmar"));
    expect(enviar.mock.calls[0]![0].pagamento.iniciar_entrega).toBe(true);
  });

  it("sem lista de produtos (organização sem preço configurado), o nome é digitado e nada sai sem ele", async () => {
    sugestoes.atual = [];
    render(<RegistrarPagamentoDialog conversationId="conv-1" open onOpenChange={() => undefined} />);
    await userEvent.type(screen.getByTestId("pagamento-valor"), "50");
    expect(screen.getByTestId("pagamento-confirmar")).toBeDisabled();
    await userEvent.type(screen.getByTestId("pagamento-produto-livre"), "Consulta avulsa");
    await userEvent.click(screen.getByTestId("pagamento-confirmar"));
    expect(enviar.mock.calls[0]![0].pagamento).toMatchObject({ produto: "Consulta avulsa", valor_cents: 5000 });
  });
});
