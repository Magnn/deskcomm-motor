import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { conectar, salvar, erro, refresh } = vi.hoisted(() => ({
  conectar: vi.fn(),
  salvar: vi.fn(),
  erro: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/app/actions/settings/conectarComStripe", () => ({ conectarComStripe: conectar }));
vi.mock("@/app/actions/settings/conectarStripe", () => ({ conectarStripe: salvar }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { error: erro, success: vi.fn(), warning: vi.fn() } }));

import { ConexaoComAStripe, type EstadoDaStripe } from "./_stripe";

function estado(): EstadoDaStripe {
  return {
    conectada: true,
    habilitada: true,
    temChave: false,
    temAviso: false,
    connect: { disponivel: true, temConta: true, pronta: true, pixAtivo: true, taxa: { fixoCentavos: 99, percentualBp: 150, tetoCentavos: 990 } },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("a empresa opera a conta conectada sem colar uma chave", () => {
  it("mostra a taxa e permite pausar sem exigir chave própria", async () => {
    salvar.mockResolvedValue({ ok: true, pixAtivo: true, conta: null });
    render(<ConexaoComAStripe estado={estado()} idioma="pt-BR" />);
    expect(screen.getByTestId("stripe-connect-taxa").textContent).toContain("0,99");
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar conexão" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith({ enabled: false }));
    expect(refresh).toHaveBeenCalled();
  });

  it("conta pausada pode ser reativada sem chave própria", async () => {
    salvar.mockResolvedValue({ ok: true, pixAtivo: true, conta: null });
    render(<ConexaoComAStripe estado={{ ...estado(), habilitada: false }} idioma="pt-BR" />);
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar conexão" }));
    await waitFor(() => expect(salvar).toHaveBeenCalledWith({ enabled: true }));
  });

  it("cadastro incompleto tem continuação e erro visível", async () => {
    conectar.mockResolvedValue({ ok: false, error: "connect_desligado" });
    const s = estado();
    s.connect.pronta = false;
    render(<ConexaoComAStripe estado={s} idioma="pt-BR" />);
    fireEvent.click(screen.getByRole("button", { name: "Continuar cadastro na Stripe" }));
    await waitFor(() =>
      expect(erro).toHaveBeenCalledWith(expect.stringContaining("não está liberada")),
    );
    expect(salvar).not.toHaveBeenCalled();
  });
});
