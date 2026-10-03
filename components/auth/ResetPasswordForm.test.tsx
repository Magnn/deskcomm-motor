import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResetPasswordForm } from "./ResetPasswordForm";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
const redefinir = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/auth/updatePassword", () => ({
  redefinirSenhaPeloFormulario: redefinir,
}));

describe("ResetPasswordForm", () => {
  it("confirma a nova senha e permite visualizar cada campo separadamente", () => {
    render(<ResetPasswordForm />);

    const password = screen.getByLabelText("Nova senha");
    const confirmation = screen.getByLabelText("Confirmar nova senha");

    expect(password).toHaveAttribute("type", "password");
    expect(confirmation).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(confirmation).toHaveAttribute("autocomplete", "new-password");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar nova senha" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Ocultar nova senha" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "Mostrar confirmação da senha" }));
    expect(confirmation).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Ocultar confirmação da senha" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("mostra a força da senha e os requisitos conforme a pessoa digita", () => {
    render(<ResetPasswordForm />);

    const password = screen.getByLabelText("Nova senha");
    const meter = screen.getByRole("meter", { name: "Força da senha" });

    expect(meter).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByTestId("password-strength-label")).toHaveTextContent("Muito fraca");

    fireEvent.change(password, { target: { value: "Senha123!" } });

    expect(meter).toHaveAttribute("aria-valuenow", "4");
    expect(meter).toHaveAttribute("aria-valuetext", "Forte");
    expect(screen.getByTestId("password-strength-label")).toHaveTextContent("Forte");
  });

  it("quando o servidor pede o código de 2 etapas, as senhas digitadas continuam nos campos", async () => {
    // O React limpa os campos NÃO controlados quando a ação termina; o pedido do
    // código chega justamente depois de a pessoa digitar as duas senhas.
    redefinir.mockResolvedValue({ ok: false, error: "mfa_required", tentativa: 1 });
    render(<ResetPasswordForm />);

    fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "Senha123!" } });
    fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "Senha123!" } });
    fireEvent.click(screen.getByRole("button", { name: "Definir nova senha" }));

    await screen.findByLabelText("Código de verificação (2 etapas)");
    expect(screen.getByLabelText("Nova senha")).toHaveValue("Senha123!");
    expect(screen.getByLabelText("Confirmar nova senha")).toHaveValue("Senha123!");
    const dados = redefinir.mock.calls[0]?.[1] as FormData;
    expect(dados.get("password")).toBe("Senha123!");
    expect(dados.get("password_confirm")).toBe("Senha123!");
  });
});
