import { describe, expect, it, vi } from "vitest";

import {
  AVISOS_DA_PAGINA,
  avisosLigados,
  enviarMensagem,
  listarPaginas,
  MessengerApiError,
  trocarCodigoPorTokenLongo,
  urlDeAutorizacao,
} from "./api";

const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

describe("urlDeAutorizacao", () => {
  it("sem configuração pede a lista de permissões avulsa", () => {
    const u = new URL(urlDeAutorizacao({ appId: "1", redirectUri: "https://x/cb", state: "s", configId: null }));
    expect(u.origin).toBe("https://www.facebook.com");
    expect(u.searchParams.get("scope")).toContain("pages_messaging");
    expect(u.searchParams.get("config_id")).toBeNull();
    expect(u.searchParams.get("state")).toBe("s");
  });

  it("com configuração do login para empresas, manda o config_id e não a lista", () => {
    const u = new URL(urlDeAutorizacao({ appId: "1", redirectUri: "https://x/cb", state: "s", configId: "cfg9" }));
    expect(u.searchParams.get("config_id")).toBe("cfg9");
    expect(u.searchParams.get("scope")).toBeNull();
  });
});

describe("trocarCodigoPorTokenLongo", () => {
  it("troca o código e depois estende para longa duração", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(resposta({ access_token: "curto" }))
      .mockResolvedValueOnce(resposta({ access_token: "longo" }));
    await expect(
      trocarCodigoPorTokenLongo({ appId: "1", appSecret: "seg", redirectUri: "https://x/cb", code: "c" }, buscar as unknown as typeof fetch),
    ).resolves.toBe("longo");
    expect(String(buscar.mock.calls[1]?.[0])).toContain("grant_type=fb_exchange_token");
    expect(String(buscar.mock.calls[1]?.[0])).toContain("fb_exchange_token=curto");
  });

  it("erro da Meta sobe com o motivo e o código", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ error: { message: "Invalid verification code", code: 100 } }, 400));
    const p = trocarCodigoPorTokenLongo({ appId: "1", appSecret: "s", redirectUri: "r", code: "c" }, buscar as unknown as typeof fetch);
    await expect(p).rejects.toBeInstanceOf(MessengerApiError);
    await expect(p).rejects.toMatchObject({ status: 400, codigo: 100, onde: "troca_do_codigo" });
  });
});

describe("listarPaginas", () => {
  it("segue a paginação da Graph e marca quem pode atender", async () => {
    const buscar = vi
      .fn()
      .mockResolvedValueOnce(
        resposta({
          data: [{ id: "p1", name: "Loja", access_token: "t1", tasks: ["MESSAGING", "ANALYZE"], picture: { data: { url: "https://f/p1.jpg" } } }],
          paging: { next: "https://graph.facebook.com/v23.0/me/accounts?after=abc" },
        }),
      )
      .mockResolvedValueOnce(resposta({ data: [{ id: "p2", name: "Só análise", access_token: "t2", tasks: ["ANALYZE"] }, { id: "sem-token" }] }));
    const paginas = await listarPaginas("tok", buscar as unknown as typeof fetch);
    expect(paginas).toEqual([
      { id: "p1", name: "Loja", accessToken: "t1", podeAtender: true, pictureUrl: "https://f/p1.jpg" },
      { id: "p2", name: "Só análise", accessToken: "t2", podeAtender: false, pictureUrl: null },
    ]);
  });

  it("não segue um `next` que aponte para fora da Graph", async () => {
    const buscar = vi.fn().mockResolvedValueOnce(resposta({ data: [], paging: { next: "https://evil.example/steal" } }));
    await listarPaginas("tok", buscar as unknown as typeof fetch);
    expect(buscar).toHaveBeenCalledTimes(1);
  });
});

describe("enviarMensagem", () => {
  it("texto sai como RESPONSE para o PSID, com o token da página no cabeçalho", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ recipient_id: "psid", message_id: "m_out" }));
    const mid = await enviarMensagem({ pageId: "p1", tokenDaPagina: "tp", psid: "psid", conteudo: { texto: "olá" } }, buscar as unknown as typeof fetch);
    expect(mid).toBe("m_out");
    const [url, init] = buscar.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/p1\/messages$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tp");
    expect(JSON.parse(String(init.body))).toEqual({ recipient: { id: "psid" }, messaging_type: "RESPONSE", message: { text: "olá" } });
  });

  it("anexo sai por URL, e citar uma mensagem leva o reply_to", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ message_id: "m_out" }));
    await enviarMensagem(
      { pageId: "p1", tokenDaPagina: "tp", psid: "psid", conteudo: { anexo: { tipo: "image", url: "https://x/a.jpg" } }, respondeA: "m_in" },
      buscar as unknown as typeof fetch,
    );
    const corpo = JSON.parse(String((buscar.mock.calls[0] as [string, RequestInit])[1].body));
    expect(corpo.message).toEqual({ attachment: { type: "image", payload: { url: "https://x/a.jpg", is_reusable: false } }, reply_to: { mid: "m_in" } });
  });

  it("resposta sem message_id é falha, nunca envio declarado", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ recipient_id: "psid" }));
    await expect(enviarMensagem({ pageId: "p1", tokenDaPagina: "tp", psid: "psid", conteudo: { texto: "x" } }, buscar as unknown as typeof fetch)).rejects.toBeInstanceOf(MessengerApiError);
  });
});

describe("avisosLigados", () => {
  it("só conta o NOSSO app com o campo de mensagens", async () => {
    const buscar = vi.fn().mockResolvedValue(resposta({ data: [{ id: "outro", subscribed_fields: ["messages"] }, { id: "nosso", subscribed_fields: [...AVISOS_DA_PAGINA] }] }));
    await expect(avisosLigados("p1", "tp", "nosso", buscar as unknown as typeof fetch)).resolves.toBe(true);
    buscar.mockResolvedValue(resposta({ data: [{ id: "outro", subscribed_fields: ["messages"] }] }));
    await expect(avisosLigados("p1", "tp", "nosso", buscar as unknown as typeof fetch)).resolves.toBe(false);
  });
});
