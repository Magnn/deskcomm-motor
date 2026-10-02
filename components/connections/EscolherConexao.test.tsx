import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { PACING_DEFAULTS } from "@/lib/agent-engine/pacing/defaults";
import { SPINNING_DEFAULTS } from "@/lib/agent-engine/spinning/defaults";

import { EscolherConexao } from "./EscolherConexao";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (value: string) => value }));

/**
 * A escolha entre conectar por QR code e pela API oficial. O que se cobra é que
 * a tela diga a diferença que IMPORTA — o que cada número aguenta — com os
 * mesmos números que o motor aplica, e que a escolha leve ao lugar certo.
 */
describe("Conectar WhatsApp — a escolha", () => {
  beforeEach(() => cleanup());

  const abrir = (onEscolher = vi.fn()) => {
    render(<EscolherConexao onEscolher={onEscolher} />);
    fireEvent.click(screen.getByTestId("conectar-whatsapp"));
    return onEscolher;
  };

  it("fechado, só o botão aparece — a escolha não ocupa a tela de quem já conectou", () => {
    render(<EscolherConexao onEscolher={vi.fn()} />);
    expect(screen.queryByTestId("conexao-qr")).toBeNull();
    expect(screen.getByTestId("conectar-whatsapp")).toBeTruthy();
  });

  it("mostra as duas formas lado a lado, cada uma dizendo para que serve", () => {
    abrir();
    expect(within(screen.getByTestId("conexao-qr")).getByText("Indicado para atendimento e conversa.")).toBeTruthy();
    expect(within(screen.getByTestId("conexao-oficial")).getByText("Indicado para funil fixo e volume.")).toBeTruthy();
  });

  it("os limites do QR vêm dos MESMOS padrões do motor — não de números copiados para a tela", () => {
    abrir();
    const qr = screen.getByTestId("conexao-qr").textContent ?? "";
    expect(qr).toContain(`${SPINNING_DEFAULTS.repetitionThreshold + 1}ª`);
    expect(qr).toContain(`${PACING_DEFAULTS.warmupDailyCaps[0]!.cap} envios por dia`);
    expect(qr).toContain(`${PACING_DEFAULTS.windowStartHour}h–${PACING_DEFAULTS.windowEndHour}h`);
    expect(qr).toContain("risco de banimento");
  });

  it("o lado oficial diz o que ele dispensa e o que ele cobra — sem prometer só vantagem", () => {
    abrir();
    const oficial = screen.getByTestId("conexao-oficial").textContent ?? "";
    expect(oficial).toContain("Sem risco de banimento por volume.");
    expect(oficial).toContain("A Meta pode cobrar");
    expect(oficial).toContain("24 horas");
  });

  it("escolher QR leva ao passo a passo do QR e fecha a escolha", () => {
    const onEscolher = abrir();
    fireEvent.click(screen.getByTestId("escolher-qr"));
    expect(onEscolher).toHaveBeenCalledWith("qr");
    expect(screen.queryByTestId("conexao-qr")).toBeNull();
  });

  it("escolher API oficial leva ao passo a passo dela", () => {
    const onEscolher = abrir();
    fireEvent.click(screen.getByTestId("escolher-oficial"));
    expect(onEscolher).toHaveBeenCalledWith("oficial");
  });
});
