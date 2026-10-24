import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "./LoginForm";

const entrar = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@/app/actions/auth/signInWithPassword", () => ({ entrarPeloFormulario: entrar }));

function enviar(email: string, senha: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: senha } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginForm", () => {
  beforeEach(() => entrar.mockReset());

  it("e-mail e senha vão no FormData da ação do servidor, com o `next` preso", async () => {
    // Sem `name`, o POST nativo (antes do JavaScript) chegaria sem os campos.
    entrar.mockResolvedValue({ ok: false, error: "invalid_credentials", email: "dona@clinica.test" });
    render(<LoginForm next="/app/inbox" />);

    enviar("dona@clinica.test", "senha-123");

    await waitFor(() => expect(entrar).toHaveBeenCalledTimes(1));
    const [next, , dados] = entrar.mock.calls[0] as [string, unknown, FormData];
    expect(next).toBe("/app/inbox");
    expect(dados.get("email")).toBe("dona@clinica.test");
    expect(dados.get("password")).toBe("senha-123");
  });

  it("senha errada: avisa, o e-mail fica no campo e a senha esvazia", async () => {
    entrar.mockResolvedValue({ ok: false, error: "invalid_credentials", email: "dona@clinica.test" });
    render(<LoginForm />);

    enviar("dona@clinica.test", "senha-errada");

    await screen.findByText("Email ou senha incorretos.");
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue("dona@clinica.test"));
    expect(screen.getByLabelText("Senha")).toHaveValue("");
  });

  it("erro de campo aparece embaixo do campo e o marca como inválido", async () => {
    entrar.mockResolvedValue({
      ok: false,
      error: "validation_error",
      email: "nao-e-email",
      campos: { email: "Email inválido" },
    });
    render(<LoginForm />);

    enviar("nao-e-email", "x");

    await screen.findByText("Email inválido");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
