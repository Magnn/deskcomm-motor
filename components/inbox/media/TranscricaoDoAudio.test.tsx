/**
 * A transcrição do áudio no chat.
 *
 * Sem provider de idioma o `t()` degrada para a chave (pt-BR); o espanhol é
 * coberto por i18n-espanhol-cobre-a-tela.
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import type { Message } from "@/lib/types/messaging";

import { TranscricaoDoAudio, transcricaoDoAudio } from "./TranscricaoDoAudio";

function audio(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    type: "audio",
    direction: "inbound",
    media_derived_status: "ready",
    media_derived_text: "quero saber o preço",
    ...over,
  } as Message;
}

describe("transcrição do áudio no chat", () => {
  it("nasce fechada e abre no clique", () => {
    render(<TranscricaoDoAudio message={audio()} isOutbound={false} />);

    expect(screen.queryByText("quero saber o preço")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver transcrição" }));
    expect(screen.getByText("quero saber o preço")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ocultar transcrição" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("transcrição que falhou não vira botão: a coluna guarda um marcador escrito para o agente", () => {
    const { container } = render(
      <TranscricaoDoAudio
        message={audio({ media_derived_status: "failed", media_derived_text: "[mídia não lida]" })}
        isOutbound={false}
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("só áudio com transcrição pronta e com texto tem o que mostrar", () => {
    expect(transcricaoDoAudio(audio())).toBe("quero saber o preço");
    expect(transcricaoDoAudio(audio({ media_derived_text: "   " }))).toBeNull();
    expect(transcricaoDoAudio(audio({ media_derived_status: null }))).toBeNull();
    expect(transcricaoDoAudio(audio({ media_derived_status: undefined, media_derived_text: undefined }))).toBeNull();
    expect(transcricaoDoAudio(audio({ type: "image" }))).toBeNull();
  });
});
