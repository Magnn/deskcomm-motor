import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForgotPasswordForm } from "./ForgotPasswordForm";

const pedir = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@/app/actions/auth/requestPasswordReset", () => ({
  pedirRedefinicaoPeloFormulario: pedir,
}));

function enviar(email: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar link de redefinição" }));
}

describe("ForgotPasswordForm", () => {
  beforeEach(() => pedir.mockReset());

  it("o e-mail vai no FormData da ação do servidor e a tela confirma o envio", async () => {
    pedir.mockResolvedValue({ ok: true });
    render(<ForgotPasswordForm />);

    enviar("dona@clinica.test");

    await screen.findByText("Verifique seu e-mail");
    const dados = pedir.mock.calls[0]?.[1] as FormData;
    // Sem `name`, o POST nativo (antes do JavaScript) chegaria sem o e-mail.
    expect(dados.get("email")).toBe("dona@clinica.test");
  });

  it("o formulário não depende do JavaScript para enviar: a ação é o `action`", () => {
    const { container } = render(<ForgotPasswordForm />);
    const form = container.querySelector("form");
    // O `onSubmit` de antes não existia no HTML; um clique antes da hidratação
    // recarregava a página e perdia o e-mail. A ação no `action` não tem esse vão.
    expect(form?.getAttribute("method")?.toLowerCase()).not.toBe("get");
    expect(screen.getByLabelText("Email")).toHaveAttribute("name", "email");
  });

  it("na falha, a mensagem aparece e o e-mail digitado continua no campo", async () => {
    pedir.mockResolvedValue({ ok: false, error: "rate_limited", email: "dona@clinica.test" });
    render(<ForgotPasswordForm />);

    enviar("dona@clinica.test");

    await screen.findByRole("alert");
    expect(screen.getByRole("alert")).toHaveTextContent("Muitas tentativas. Aguarde alguns minutos.");
    await waitFor(() => expect(screen.getByLabelText("Email")).toHaveValue("dona@clinica.test"));
  });

  it("e-mail inválido aponta o campo", async () => {
    pedir.mockResolvedValue({ ok: false, error: "validation_error", email: "nao-e-email" });
    render(<ForgotPasswordForm />);

    enviar("nao-e-email");

    await screen.findByText("Email inválido. Confira o campo.");
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
  });
});
