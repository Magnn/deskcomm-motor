import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MfaForm } from "./MfaForm";

const verificar = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@/app/actions/auth/verifyMfa", () => ({ verificarMfaPeloFormulario: verificar }));

function digitar(codigo: string) {
  codigo.split("").forEach((digito, i) => {
    fireEvent.change(screen.getByLabelText(`Dígito ${i + 1}`), { target: { value: digito } });
  });
}

describe("MfaForm", () => {
  beforeEach(() => verificar.mockReset());

  it("completar os seis dígitos envia o código INTEIRO para a ação do servidor", async () => {
    // O `onComplete` chega de dentro do `onChange`, antes de o sexto dígito
    // virar estado — sem o `flushSync`, o campo oculto ia com cinco dígitos.
    verificar.mockResolvedValue({ ok: false, error: "mfa_invalid", tentativa: 1 });
    render(<MfaForm next="/app/inbox" />);

    digitar("123456");

    await waitFor(() => expect(verificar).toHaveBeenCalledTimes(1));
    const [next, , dados] = verificar.mock.calls[0] as [string, unknown, FormData];
    expect(next).toBe("/app/inbox");
    expect(dados.get("code")).toBe("123456");
  });

  it("código errado: avisa e limpa os quadradinhos para a próxima tentativa", async () => {
    verificar.mockResolvedValue({ ok: false, error: "mfa_invalid", tentativa: 1 });
    render(<MfaForm />);

    digitar("654321");

    await screen.findByText("Código inválido. Tente novamente.");
    await waitFor(() => expect(screen.getByLabelText("Dígito 1")).toHaveValue(""));
    expect(screen.getByLabelText("Dígito 6")).toHaveValue("");
  });

  it("bloqueado: mostra a contagem e trava o envio", async () => {
    verificar.mockResolvedValue({ ok: false, error: "mfa_locked", retry_in_seconds: 30, tentativa: 1 });
    render(<MfaForm />);

    digitar("111111");

    await screen.findByText("Muitas tentativas. Tente novamente em 30s.");
    expect(screen.getByRole("button", { name: "Verificar" })).toBeDisabled();
    expect(screen.getByLabelText("Dígito 1")).toBeDisabled();
  });
});
