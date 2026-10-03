import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("./paginas", () => ({ tokenDaPagina: vi.fn() }));

import { messengerAdapter } from "./adapter";
import { externalIdDoMessenger } from "./parser";
import { tokenDaPagina } from "./paginas";

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const envelope = {
  organizationId: "org-1",
  sessionRef: "pagina-1",
  to: "provider-thread",
  providerConversationId: "psid-1",
};

describe("messengerAdapter.send", () => {
  const buscar = vi.fn();
  beforeEach(() => {
    vi.mocked(tokenDaPagina).mockResolvedValue("token-da-pagina");
    buscar.mockReset();
    vi.stubGlobal("fetch", buscar);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("texto sai para o PSID da thread e volta com o id que o eco vai trazer", async () => {
    buscar.mockResolvedValue(resposta({ message_id: "m_1" }));
    const r = await messengerAdapter.send({ ...envelope, kind: "text", body: "olá" });
    expect(r.externalId).toBe(externalIdDoMessenger("pagina-1", "m_1"));
    expect(JSON.parse(String((buscar.mock.calls[0] as [string, RequestInit])[1].body)).recipient).toEqual({ id: "psid-1" });
  });

  it("sem thread não há a quem responder", async () => {
    await expect(messengerAdapter.send({ ...envelope, providerConversationId: null, kind: "text", body: "x" })).rejects.toThrow(/Aguarde uma mensagem/);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("anexo com legenda sai em duas mensagens; o id devolvido é o do anexo", async () => {
    buscar.mockResolvedValueOnce(resposta({ message_id: "m_anexo" })).mockResolvedValueOnce(resposta({ message_id: "m_legenda" }));
    const r = await messengerAdapter.send({
      ...envelope,
      kind: "document",
      media: { url: "https://x/a.pdf", mime: "application/pdf", caption: "Seu guia" },
    });
    expect(r.externalId).toBe(externalIdDoMessenger("pagina-1", "m_anexo"));
    const corpos = buscar.mock.calls.map((c) => JSON.parse(String((c as [string, RequestInit])[1].body)));
    expect(corpos[0].message.attachment.type).toBe("file");
    expect(corpos[1].message).toEqual({ text: "Seu guia" });
  });

  it("fora da janela de 24h, a recusa da Meta vira a frase de quem atende", async () => {
    buscar.mockResolvedValue(resposta({ error: { message: "(#10) This message is sent outside of allowed window.", code: 10 } }, 400));
    await expect(messengerAdapter.send({ ...envelope, kind: "text", body: "x" })).rejects.toThrow(/24h/);
  });

  it("tipo sem equivalente no Messenger é recusado antes de chamar a Meta", async () => {
    await expect(messengerAdapter.send({ ...envelope, kind: "location", body: "x" })).rejects.toThrow(/não é suportado/);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("sem token da página, pede para reconectar", async () => {
    vi.mocked(tokenDaPagina).mockResolvedValue(null);
    await expect(messengerAdapter.send({ ...envelope, kind: "text", body: "x" })).rejects.toThrow(/Reconecte/);
  });

  it("confere a origem ANTES de transportar", async () => {
    const beforeSend = vi.fn().mockRejectedValue(new Error("superado"));
    await expect(messengerAdapter.send({ ...envelope, kind: "text", body: "x", beforeSend })).rejects.toThrow("superado");
    expect(buscar).not.toHaveBeenCalled();
  });
});

describe("messengerAdapter.signalTyping", () => {
  it("sem a thread, sai calado (o indicador é decoração)", async () => {
    const buscar = vi.fn();
    vi.stubGlobal("fetch", buscar);
    await messengerAdapter.signalTyping?.({ organizationId: "org-1", sessionRef: "pagina-1", recipient: "provider-thread", providerConversationId: null });
    expect(buscar).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
