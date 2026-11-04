import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CartaDoDia, DiarioDoCliente } from "@/app/c/[org]/_client";
import { MemoriasDaArea } from "@/app/c/[org]/_memorias";
import { RitualDeHoje } from "@/app/c/[org]/_ritual";
import { textosDoNavegador, textosDoRitual } from "@/app/c/[org]/_textos";
import { EVENTO_CARTA_REVELADA, EVENTO_CONVERSA_ENVIADA, progressoDoRitual } from "@/lib/area-do-cliente/ritual";

const tx = textosDoNavegador((s) => s);
const tr = textosDoRitual((s) => s);
const inicial = [{ passo: "carta" as const, feito: false }, { passo: "diario" as const, feito: false }, { passo: "conversa" as const, feito: false }];

function ritual(passos = inicial) {
  return <RitualDeHoje inicial={passos} nomeDaGuia="Esmeralda" tr={tr} carta={<p>Minha carta</p>} diario={<p>Meu diário</p>} />;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("ritual no ritmo de quem lê", () => {
  it("mantém a leitura aberta mesmo depois do antigo prazo de seis segundos", () => {
    vi.useFakeTimers();
    render(ritual());
    act(() => { window.dispatchEvent(new Event(EVENTO_CARTA_REVELADA)); vi.advanceTimersByTime(10_000); });
    expect(screen.getByText("Minha carta").parentElement?.hidden).toBe(false);
    expect(screen.getByTestId("area-ritual-contagem").textContent).toBe("1/2");
    fireEvent.click(screen.getByRole("button", { name: tr.continuar }));
    expect(screen.getByText("Meu diário").parentElement?.hidden).toBe(false);
  });

  it("conclui sem exigir conversa e permite reler qualquer passo", () => {
    render(ritual(inicial.map((p) => ({ ...p, feito: p.passo !== "conversa" }))));
    expect(screen.getByTestId("area-ritual-completo")).toBeTruthy();
    expect(screen.getByTestId("area-ritual-contagem").textContent).toBe("2/2");
    fireEvent.click(screen.getByTestId("area-ritual-passo-carta"));
    expect(screen.getByText("Minha carta").parentElement?.hidden).toBe(false);
    expect(screen.queryByTestId("area-ritual-completo")).toBeNull();
  });

  it("uma mensagem aceita marca a conversa opcional sem inflar o progresso", () => {
    render(ritual());
    act(() => window.dispatchEvent(new Event(EVENTO_CONVERSA_ENVIADA)));
    expect(screen.getByTestId("area-ritual-contagem").textContent).toBe("0/2");
    expect(screen.getByTestId("area-ritual-passo-conversa").getAttribute("aria-current")).toBe("step");
  });

  it("sem carta habilitada, basta o diário; só a conversa não cria um ritual concluído", () => {
    expect(progressoDoRitual([{ passo: "diario", feito: true }, { passo: "conversa", feito: false }])).toEqual({ feitos: 1, total: 1, completo: true });
    expect(progressoDoRitual([{ passo: "conversa", feito: true }]).completo).toBe(false);
  });
});

describe("progresso confirmado e memórias", () => {
  it("falha de rede não revela nem completa a carta; uma nova tentativa aceita revela", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<><CartaDoDia slug="teste" cor="#c9a54e" tx={tx} cartaId={17} nome="A Estrela" mensagem="Seu momento" foto={null} />{ritual()}</>);
    fireEvent.click(screen.getByTestId("area-revelar-carta"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(tx.semConexao));
    expect(screen.getByTestId("area-ritual-contagem").textContent).toBe("0/2");
    expect(screen.queryByTestId("area-carta-nome")).toBeNull();
    fireEvent.click(screen.getByTestId("area-revelar-carta"));
    await waitFor(() => expect(screen.getByTestId("area-carta-nome").textContent).toBe("A Estrela"));
    expect(screen.getByTestId("area-ritual-contagem").textContent).toBe("1/2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a anotação aceita aparece nas memórias com a data no fuso da pessoa", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { id: "novo", texto: "Meu próximo passo", created_at: "2026-11-04T02:00:00Z" } }) }));
    render(<><DiarioDoCliente slug="teste" cor="#c9a54e" tx={tx} entradas={[]} /><MemoriasDaArea entradas={[]} tag="pt-BR" fuso="America/Manaus" titulo="Memórias" recentes="Recentes" vazio="Ainda sem reflexões" /></>);
    fireEvent.change(screen.getByRole("textbox", { name: tx.seuDiario }), { target: { value: "Meu próximo passo" } });
    fireEvent.click(screen.getByRole("button", { name: tx.salvar }));
    await waitFor(() => expect(screen.getByTestId("area-memorias").textContent).toContain("Meu próximo passo"));
    expect(screen.getByTestId("area-memorias").textContent).toContain("3 de novembro");
    expect(screen.queryByText("Ainda sem reflexões")).toBeNull();
  });
});
