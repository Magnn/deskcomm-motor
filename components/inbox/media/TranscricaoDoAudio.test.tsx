/**
 * A transcrição do áudio no chat: o texto aparece sem clique, e a falha diz que falhou.
 *
 * Sem provider de idioma o `t()` degrada para a chave (pt-BR); o espanhol é
 * coberto por i18n-espanhol-cobre-a-tela.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { Message } from "@/lib/types/messaging";

import { TranscricaoDoAudio, estadoDaTranscricao, transcricaoDoAudio } from "./TranscricaoDoAudio";

vi.mock("@/lib/api/client", () => ({ apiClient: { post: vi.fn(async () => ({})) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

const AGORA = new Date("2026-10-06T18:00:00Z").getTime();

function audio(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    conversation_id: "c1",
    type: "audio",
    direction: "inbound",
    media_storage_path: "org/conv/a.ogg",
    media_derived_status: "ready",
    media_derived_text: "quero saber o preço",
    created_at: "2026-10-06T17:59:00Z",
    ...over,
  } as Message;
}

function tela(message: Message) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <TranscricaoDoAudio message={message} isOutbound={false} />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.mocked(apiClient.post).mockClear());

describe("estadoDaTranscricao", () => {
  it("pronta com texto mostra o texto; pronta e vazia não mostra nada", () => {
    expect(estadoDaTranscricao(audio(), AGORA)).toEqual({ estado: "pronta", texto: "quero saber o preço" });
    expect(estadoDaTranscricao(audio({ media_derived_text: "   " }), AGORA)).toEqual({ estado: "nada" });
  });

  it("falha em áudio RECEBIDO é falha; o marcador escrito para o agente nunca vira texto de tela", () => {
    const falho = audio({ media_derived_status: "failed", media_derived_text: "[o cliente enviou uma mídia que não consegui interpretar]" });
    expect(estadoDaTranscricao(falho, AGORA)).toEqual({ estado: "falhou" });
    expect(transcricaoDoAudio(falho)).toBeNull();
  });

  it("sem resultado: recebido há pouco está em andamento; antigo, enviado pela casa ou sem arquivo não mostram nada", () => {
    const pendente = audio({ media_derived_status: null, media_derived_text: null });
    expect(estadoDaTranscricao(pendente, AGORA)).toEqual({ estado: "em_andamento" });
    expect(estadoDaTranscricao({ ...pendente, created_at: "2026-10-06T10:00:00Z" }, AGORA)).toEqual({ estado: "nada" });
    expect(estadoDaTranscricao({ ...pendente, direction: "outbound" }, AGORA)).toEqual({ estado: "nada" });
    expect(estadoDaTranscricao({ ...pendente, media_storage_path: null }, AGORA)).toEqual({ estado: "nada" });
    expect(estadoDaTranscricao(audio({ type: "image" }), AGORA)).toEqual({ estado: "nada" });
  });
});

describe("transcrição do áudio no chat", () => {
  it("o texto aparece direto, sem clique", () => {
    tela(audio());
    expect(screen.getByText("quero saber o preço")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("texto longo vem cortado e abre em 'Ver tudo'", () => {
    const longo = "palavra ".repeat(80).trim();
    tela(audio({ media_derived_text: longo }));
    expect(screen.queryByText(longo)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver tudo" }));
    expect(screen.getByText(longo)).toBeTruthy();
  });

  it("áudio que falhou DIZ que falhou e oferece tentar de novo, que chama a rota e passa a esperar", async () => {
    tela(audio({ media_derived_status: "failed", media_derived_text: "[marcador do agente]" }));
    expect(screen.getByText("Não foi possível transcrever este áudio.")).toBeTruthy();
    expect(screen.queryByText("[marcador do agente]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith("/api/v1/messages/m1/retranscrever", {}));
  });

  it("sem provedor de consultas, o que não falhou desenha normalmente (o balão de outras mensagens não depende dele)", () => {
    render(<TranscricaoDoAudio message={audio()} isOutbound={false} />);
    expect(screen.getByText("quero saber o preço")).toBeTruthy();
  });

  it("o que não tem nada a dizer não desenha nada", () => {
    const { container } = tela(audio({ direction: "outbound", media_derived_status: null, media_derived_text: null }));
    expect(container.innerHTML).toBe("");
  });
});
