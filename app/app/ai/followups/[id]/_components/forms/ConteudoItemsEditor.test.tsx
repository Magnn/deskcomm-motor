/**
 * Mover e duplicar são controles DIFERENTES. O ícone de mover chamava
 * `onDuplicate`: quem tentava reordenar ganhava um card repetido e a ordem
 * não mudava. Aqui: a alça move (pelo teclado, que é o caminho que o jsdom
 * exercita de verdade), o botão de duplicar duplica, e um não faz o outro.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ConteudoItem } from "@/lib/followup/graph-schema";

import { ConteudoItemsEditor } from "./ConteudoItemsEditor";

const ITENS: ConteudoItem[] = [
  { type: "text", body: "primeiro" },
  { type: "text", body: "segundo" },
  { type: "text", body: "terceiro" },
];

function montar(items: ConteudoItem[] = ITENS) {
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ConteudoItemsEditor flowId="11111111-1111-4111-8111-111111111111" items={items} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

const ESPACO = { keyCode: 32, key: " " };
const SETA_BAIXO = { keyCode: 40, key: "ArrowDown" };

describe("ConteudoItemsEditor — mover e duplicar", () => {
  it("a alça leva o card para baixo e grava a ordem nova", async () => {
    const onChange = montar();
    const alca = screen.getByTestId("conteudo-item-mover-0");

    alca.focus();
    fireEvent.keyDown(alca, ESPACO);
    // O clone do arraste é outro elemento (vai para o <body>): as setas e o
    // soltar são ouvidos na janela, não na alça.
    fireEvent.keyDown(window, SETA_BAIXO);
    fireEvent.keyDown(window, SETA_BAIXO);
    await act(async () => {
      fireEvent.keyDown(window, ESPACO);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].map((i: { body: string }) => i.body)).toEqual([
      "segundo",
      "terceiro",
      "primeiro",
    ]);
  });

  it("clicar na alça não duplica o card", () => {
    const onChange = montar();
    fireEvent.click(screen.getByTestId("conteudo-item-mover-1"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("o botão de duplicar insere a cópia logo abaixo", () => {
    const onChange = montar();
    fireEvent.click(screen.getByTestId("conteudo-item-duplicar-1"));
    expect(onChange.mock.calls[0]![0].map((i: { body: string }) => i.body)).toEqual([
      "primeiro",
      "segundo",
      "segundo",
      "terceiro",
    ]);
  });

  it("com um card só não há alça: não existe para onde mover", () => {
    montar([{ type: "text", body: "único" }]);
    expect(screen.queryByTestId("conteudo-item-mover-0")).toBeNull();
    expect(screen.getByTestId("conteudo-item-duplicar-0")).toBeInTheDocument();
  });
});
