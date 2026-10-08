import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ApagarVozClonada } from "./ApagarVozClonada";

const h = vi.hoisted(() => ({ delete: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: h }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: h.erro }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = (aoApagar = vi.fn()) => {
  render(<ApagarVozClonada provedor="elevenlabs" vozId="voz/1" nome="Atual" aoApagar={aoApagar} />);
  return aoApagar;
};

it("⭐ pede confirmação antes: o clique no botão não apaga nada", () => {
  montar();
  fireEvent.click(screen.getByTestId("apagar-voz"));
  expect(h.delete).not.toHaveBeenCalled();
  expect(screen.getByText(/não pode ser recuperada/)).toBeTruthy();
});

it("confirmado: chama a rota da voz certa e avisa quem montou", async () => {
  h.delete.mockResolvedValue({ data: { deleted: true } });
  const aoApagar = montar();
  fireEvent.click(screen.getByTestId("apagar-voz"));
  fireEvent.click(screen.getByTestId("confirmar-apagar-voz"));

  await waitFor(() => expect(aoApagar).toHaveBeenCalledTimes(1));
  // O id vai escapado: ele vem do provedor e entra num caminho.
  expect(h.delete).toHaveBeenCalledWith("/api/v1/ai/voices/elevenlabs/voz%2F1");
});

it("⭐ recusa (voz em uso por um agente): mostra o motivo e NÃO trata como apagada", async () => {
  h.delete.mockRejectedValue(new Error("voice_in_use"));
  const aoApagar = montar();
  fireEvent.click(screen.getByTestId("apagar-voz"));
  fireEvent.click(screen.getByTestId("confirmar-apagar-voz"));

  await waitFor(() => expect(h.erro).toHaveBeenCalledTimes(1));
  expect(aoApagar).not.toHaveBeenCalled();
});
