import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FaleComAGente, type TextosDaArea } from "@/app/c/[org]/_client";

const tx = {
  faleComAGente: "Fale com a gente",
  faleComAGenteConvite: "Volte aqui para acompanhar.",
  escrevaAqui: "Escreva sua mensagem",
  enviar: "Enviar",
  enviando: "Enviando…",
  enviada: "Enviada. A gente responde por aqui.",
  conversaGuardada: "Sua conversa",
  voce: "Você",
  nos: "Nós",
  naoFoiPossivel: "Não foi possível agora.",
  semConexao: "Sem conexão.",
} as TextosDaArea;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a pessoa acompanha o atendimento da área", () => {
  it("vê data e hora no fuso da empresa", () => {
    render(<FaleComAGente slug="magno" cor="#7c3aed" tx={tx} fuso="America/Manaus" inicial={[
      { id: "1", autor: "equipe", texto: "Sua resposta", quando: "2026-10-16T02:30:00Z" },
    ]} />);
    const hora = screen.getByText(/15\/10.*22:30/);
    expect(hora.tagName).toBe("TIME");
    expect(hora.getAttribute("datetime")).toBe("2026-10-16T02:30:00Z");
  });

  it("só confirma envio depois de a API aceitar e mostra a mensagem", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {
      id: "2", autor: "cliente", texto: "Minha dúvida", quando: "2026-10-16T02:30:00Z",
    } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<FaleComAGente slug="magno" cor="#7c3aed" tx={tx} inicial={[]} />);
    const campo = screen.getByRole("textbox", { name: tx.escrevaAqui });
    fireEvent.change(campo, { target: { value: "Minha dúvida" } });
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(tx.enviada));
    expect(screen.getByRole("list", { name: tx.conversaGuardada }).textContent).toContain("Minha dúvida");
    expect((campo as HTMLTextAreaElement).value).toBe("");
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/area/publica/magno/mensagens", expect.objectContaining({
      method: "POST", body: JSON.stringify({ texto: "Minha dúvida" }),
    }));
  });

  it("na falha mantém o texto para tentar novamente e não anuncia sucesso", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<FaleComAGente slug="magno" cor="#7c3aed" tx={tx} inicial={[]} />);
    const campo = screen.getByRole("textbox", { name: tx.escrevaAqui });
    fireEvent.change(campo, { target: { value: "Não perder este texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(tx.semConexao));
    expect((campo as HTMLTextAreaElement).value).toBe("Não perder este texto");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
