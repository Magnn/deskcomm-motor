import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoverOrganizationForm } from "./RecoverOrganizationForm";

const recuperar = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));
vi.mock("@/app/actions/auth/recoverOrganization", () => ({
  recuperarOrganizacaoPeloFormulario: recuperar,
}));

describe("RecoverOrganizationForm", () => {
  beforeEach(() => recuperar.mockReset());

  it("o nome sugerido vai no FormData mesmo com o campo desabilitado durante o envio", async () => {
    // Campo `disabled` NÃO entra no FormData; o envio tem de capturar o nome
    // antes de o `isPending` desabilitar o campo.
    recuperar.mockResolvedValue({ ok: false, error: "rate_limited", name: "Plata Iphones" });
    render(<RecoverOrganizationForm nomeSugerido="Plata Iphones" />);

    fireEvent.click(screen.getByRole("button", { name: "Continuar para o onboarding" }));

    await waitFor(() => expect(recuperar).toHaveBeenCalledTimes(1));
    const dados = recuperar.mock.calls[0]?.[1] as FormData;
    expect(dados.get("name")).toBe("Plata Iphones");
    await screen.findByText("Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.");
    expect(screen.getByLabelText("Nome da empresa")).toHaveValue("Plata Iphones");
  });
});
