/**
 * Mover e duplicar são controles DIFERENTES. O ícone de mover chamava
 * `onDuplicate`: quem tentava reordenar ganhava um card repetido e a ordem
 * não mudava. Aqui: a alça move (pelo teclado, que é o caminho que o jsdom
 * exercita de verdade), o botão de duplicar duplica, e um não faz o outro.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import * as React from "react";
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

/** Envio que só termina quando o teste manda — para mexer na lista no meio. */
const envio = vi.hoisted(() => ({ concluir: null as null | ((r: unknown) => void) }));
vi.mock("@/hooks/ai/useUploadFlowContentMedia", async () => {
  const { useState } = await import("react");
  return {
    useUploadFlowContentMedia: () => {
      const [isPending, setPending] = useState(false);
      return {
        isPending,
        progresso: isPending ? 40 : null,
        cancelar: () => {},
        mutateAsync: () =>
          new Promise((resolve) => {
            setPending(true);
            envio.concluir = (r) => {
              setPending(false);
              resolve(r);
            };
          }),
      };
    },
  };
});

/** O editor com a lista viva, como o formulário de verdade o usa. */
function montarVivo(inicial: ConteudoItem[]) {
  const atual = { items: inicial };
  function Tela() {
    const [items, setItems] = React.useState(inicial);
    atual.items = items;
    return <ConteudoItemsEditor flowId="11111111-1111-4111-8111-111111111111" items={items} onChange={setItems} />;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tela = render(
    <QueryClientProvider client={client}>
      <Tela />
    </QueryClientProvider>,
  );
  return { atual, tela };
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

  it("o arquivo cai no card que o enviou, mesmo que a lista mude durante o envio", async () => {
    const { atual, tela } = montarVivo([
      { type: "text", body: "abertura" },
      { type: "document", storage_path: "", mime: "" },
    ]);
    const arquivo = new File(["x"], "principal.pdf", { type: "application/pdf" });
    const input = tela.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      fireEvent.change(input, { target: { files: [arquivo] } });
    });
    expect(screen.getByTestId("conteudo-envio-em-curso")).toBeInTheDocument();

    // No meio do envio: duplica o texto (o documento desce uma posição) e
    // escreve a legenda do documento.
    fireEvent.click(screen.getByTestId("conteudo-item-duplicar-0"));
    fireEvent.change(screen.getByTestId("conteudo-legenda"), { target: { value: "Seu material" } });
    expect(atual.items.map((i) => i.type)).toEqual(["text", "text", "document"]);
    // O envio em curso continua no card do documento, que agora é o terceiro.
    expect(
      screen.getByTestId("conteudo-item-2").contains(screen.getByTestId("conteudo-envio-em-curso")),
    ).toBe(true);

    await act(async () => {
      envio.concluir!({ storage_path: "org/flow-content/f/a.pdf", media_mime: "application/pdf", media_size_bytes: 1, kind: "document" });
    });

    expect(atual.items).toEqual([
      { type: "text", body: "abertura" },
      { type: "text", body: "abertura" },
      {
        type: "document",
        storage_path: "org/flow-content/f/a.pdf",
        mime: "application/pdf",
        filename: "principal.pdf",
        caption: "Seu material",
      },
    ]);
    expect(screen.queryByTestId("conteudo-envio-em-curso")).toBeNull();
  });

  it("card removido durante o envio não volta quando a resposta chega", async () => {
    const { atual, tela } = montarVivo([
      { type: "text", body: "abertura" },
      { type: "document", storage_path: "", mime: "" },
    ]);
    const input = tela.container.querySelector<HTMLInputElement>('input[type="file"]')!;
    await act(async () => {
      fireEvent.change(input, { target: { files: [new File(["x"], "a.pdf", { type: "application/pdf" })] } });
    });
    const concluir = envio.concluir!;
    fireEvent.click(within(screen.getByTestId("conteudo-item-1")).getByTitle("Remover"));
    await act(async () => {
      concluir({ storage_path: "org/flow-content/f/a.pdf", media_mime: "application/pdf", media_size_bytes: 1, kind: "document" });
    });
    expect(atual.items).toEqual([{ type: "text", body: "abertura" }]);
  });
});
