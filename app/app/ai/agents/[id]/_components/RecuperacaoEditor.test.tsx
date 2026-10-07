/**
 * A recuperação de silêncio na tela do agente: ligar propõe a régua padrão, e o que a tela devolve é
 * sempre o formato que o worker lê.
 *
 * Sem provider de idioma o `t()` degrada para a chave (pt-BR); o espanhol é coberto por
 * i18n-espanhol-cobre-a-tela.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { RECUPERACAO_PADRAO, recuperacaoSchema, type Recuperacao } from "@/lib/recuperacao/config";

import { RecuperacaoEditor, unidadeDoPasso } from "./RecuperacaoEditor";

function tela(value: Recuperacao | null) {
  const onChange = vi.fn();
  render(<RecuperacaoEditor value={value} onChange={onChange} />);
  return onChange;
}

describe("RecuperacaoEditor", () => {
  it("desligada mostra só o interruptor; ligar propõe 3 min, 15 min, 3 h e a última janela 3 h antes", () => {
    const onChange = tela(null);
    expect(screen.queryByText("Adicionar chamada")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Chamar de novo quem parou de responder" }));
    expect(onChange).toHaveBeenCalledWith(RECUPERACAO_PADRAO);
  });

  it("desligar guarda os tempos escolhidos, só com `enabled: false`", () => {
    const escolhida: Recuperacao = { ...RECUPERACAO_PADRAO, steps_minutes: [5, 30] };
    const onChange = tela(escolhida);
    fireEvent.click(screen.getByRole("switch", { name: "Chamar de novo quem parou de responder" }));
    expect(onChange).toHaveBeenCalledWith({ ...escolhida, enabled: false });
  });

  it("3 horas aparece como 3 e 'horas'; trocar para minutos grava 3 minutos", () => {
    expect(unidadeDoPasso(180)).toBe("h");
    expect(unidadeDoPasso(15)).toBe("min");
    expect(unidadeDoPasso(90)).toBe("min");

    const onChange = tela(RECUPERACAO_PADRAO);
    const terceira = screen.getByLabelText("3ª chamada após") as HTMLInputElement;
    expect(terceira.value).toBe("3");

    fireEvent.change(terceira, { target: { value: "5" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...RECUPERACAO_PADRAO, steps_minutes: [3, 15, 300] });
  });

  it("adicionar e remover chamadas devolve sempre uma régua válida", () => {
    const onChange = tela(RECUPERACAO_PADRAO);
    fireEvent.click(screen.getByRole("button", { name: "Adicionar chamada" }));
    const comQuatro = onChange.mock.lastCall?.[0] as Recuperacao;
    expect(comQuatro.steps_minutes).toEqual([3, 15, 180, 360]);
    expect(recuperacaoSchema.safeParse(comQuatro).success).toBe(true);

    fireEvent.click(screen.getAllByRole("button", { name: "Remover" })[0]!);
    expect(onChange).toHaveBeenLastCalledWith({ ...RECUPERACAO_PADRAO, steps_minutes: [15, 180] });
  });

  it("régua fora de ordem avisa na tela", () => {
    tela({ ...RECUPERACAO_PADRAO, steps_minutes: [15, 3] });
    expect(screen.getByText("Cada chamada precisa vir depois da anterior, e todas dentro de 23 horas.")).toBeTruthy();
  });

  it("a última janela tem o próprio interruptor e as horas ficam entre 1 e 12", () => {
    const onChange = tela(RECUPERACAO_PADRAO);
    fireEvent.change(screen.getByLabelText("Enviar quando faltarem"), { target: { value: "40" } });
    expect(onChange).toHaveBeenLastCalledWith({
      ...RECUPERACAO_PADRAO,
      keep_window: { enabled: true, hours_before_close: 12 },
    });

    fireEvent.click(screen.getByRole("switch", { name: "Manter a conversa aberta até a data que o cliente combinou" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...RECUPERACAO_PADRAO,
      keep_window: { enabled: false, hours_before_close: 3 },
    });
  });
});
