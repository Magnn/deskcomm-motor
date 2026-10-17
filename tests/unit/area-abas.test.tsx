import * as React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AbasDaArea, BotaoIrParaAba } from "@/app/c/[org]/_abas";
import { abaValida } from "@/lib/area-do-cliente/abas";

const rotulos = { hoje: "Hoje", trabalho: "Meu trabalho", conversa: "Conversa", explorar: "Explorar" };

function montar(inicial: "hoje" | "trabalho" | "conversa" | "explorar" = "hoje") {
  return render(
    <AbasDaArea
      inicial={inicial}
      rotulos={rotulos}
      rotuloDaBarra="Atalhos da sua área"
      cor="#7c3aed"
      rodape={<footer>rodapé</footer>}
      paineis={{
        hoje: (
          <p>
            painel hoje <BotaoIrParaAba aba="conversa">Responder</BotaoIrParaAba>
          </p>
        ),
        trabalho: <p>painel trabalho</p>,
        conversa: <p>painel conversa</p>,
        explorar: <p>painel explorar</p>,
      }}
    />,
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/c/magno");
});

describe("as abas da área do cliente", () => {
  it("a aba do endereço vale só se for uma das quatro", () => {
    expect(abaValida("conversa")).toBe("conversa");
    expect(abaValida("")).toBe("hoje");
    expect(abaValida(null)).toBe("hoje");
    expect(abaValida("admin")).toBe("hoje");
  });

  it("mostra uma aba por vez e guarda a escolhida no endereço", () => {
    montar();
    expect(screen.getByTestId("area-aba-hoje").hidden).toBe(false);
    expect(screen.getByTestId("area-aba-trabalho").hidden).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "Meu trabalho" }));
    expect(screen.getByTestId("area-aba-trabalho").hidden).toBe(false);
    expect(screen.getByTestId("area-aba-hoje").hidden).toBe(true);
    expect(screen.getByRole("tab", { name: "Meu trabalho" }).getAttribute("aria-selected")).toBe("true");
    expect(window.location.search).toBe("?aba=trabalho");
    // O rodapé não pertence a aba nenhuma.
    expect(screen.getByText("rodapé")).toBeTruthy();
  });

  it("um botão de dentro de uma aba leva a outra, e o voltar do navegador desfaz", () => {
    montar();
    fireEvent.click(screen.getByText("Responder"));
    expect(screen.getByTestId("area-aba-conversa").hidden).toBe(false);
    expect(window.location.search).toBe("?aba=conversa");

    act(() => {
      window.history.replaceState(null, "", "/c/magno");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("area-aba-hoje").hidden).toBe(false);
  });

  it("abre direto na aba que veio do servidor", () => {
    montar("explorar");
    expect(screen.getByTestId("area-aba-explorar").hidden).toBe(false);
    expect(screen.getByTestId("area-aba-hoje").hidden).toBe(true);
  });
});
