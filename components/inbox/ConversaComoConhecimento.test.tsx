import { beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConversaComoConhecimento } from "./ConversaComoConhecimento";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), erro: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: h }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: h.erro }));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const montar = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ConversaComoConhecimento conversationId="c1" />
    </QueryClientProvider>,
  );

it("⭐ o controle nasce na posição que o banco diz — marcada aparece ligada", async () => {
  h.get.mockResolvedValue({ data: { id: "c1", usable_for_rag: true, rag_review_status: null } });
  montar();
  const chave = await screen.findByRole("switch");
  expect(chave.getAttribute("aria-checked")).toBe("true");
  expect(h.get).toHaveBeenCalledWith("/api/v1/conversations/c1/usable-for-rag");
});

it("sem o estado lido, o controle não aparece (um clique cego poderia desmarcar)", async () => {
  h.get.mockRejectedValue(new Error("fora do ar"));
  montar();
  await waitFor(() => expect(h.get).toHaveBeenCalled());
  expect(screen.queryByRole("switch")).toBeNull();
});

it("ligar manda enabled: true e o controle fica ligado", async () => {
  h.get.mockResolvedValue({ data: { id: "c1", usable_for_rag: false, rag_review_status: null } });
  h.post.mockResolvedValue({ data: { id: "c1", usable_for_rag: true } });
  montar();
  fireEvent.click(await screen.findByRole("switch"));

  await waitFor(() => expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true"));
  expect(h.post).toHaveBeenCalledWith("/api/v1/conversations/c1/usable-for-rag", { enabled: true });
});

it("recusa do servidor: mostra o erro e o controle continua como estava", async () => {
  h.get.mockResolvedValue({ data: { id: "c1", usable_for_rag: false, rag_review_status: null } });
  h.post.mockRejectedValue(new Error("sem permissão"));
  montar();
  fireEvent.click(await screen.findByRole("switch"));

  await waitFor(() => expect(h.erro).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
});

it("conversa que ficou para revisão diz por que não entrou", async () => {
  h.get.mockResolvedValue({ data: { id: "c1", usable_for_rag: true, rag_review_status: "pending_review" } });
  montar();
  await screen.findByTestId("conhecimento-em-revisao");
});
