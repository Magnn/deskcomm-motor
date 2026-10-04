import { describe, expect, it, vi } from "vitest";

import { inspecionarToken, tokenDaVolta } from "./token";

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** Cada chamada é registrada como `aresta` + os parâmetros do CORPO. */
function graph(respostas: Response[]) {
  const chamadas: { url: string; aresta: string; corpo: URLSearchParams }[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    chamadas.push({ url, aresta: new URL(url).pathname.split("/").slice(2).join("/"), corpo: init?.body as URLSearchParams });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`chamada a mais: ${url}`);
    return proxima;
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const p = { appId: "app1", appSecret: "seg", redirectUri: "https://x/volta", code: "cod" };

describe("o token da volta do Facebook", () => {
  it("token de usuário do sistema fica como veio — não passa pela troca de longa duração", async () => {
    const { buscar, chamadas } = graph([
      resposta(200, { access_token: "do-sistema" }),
      resposta(200, { data: { type: "SYSTEM_USER", scopes: ["ads_read"], granular_scopes: [{ scope: "ads_read", target_ids: ["9"] }] } }),
    ]);

    const r = await tokenDaVolta(p, buscar);

    expect(r.token).toBe("do-sistema");
    expect(r.inspecao).toEqual({ tipo: "SYSTEM_USER", escopos: ["ads_read"], contasConcedidas: ["9"] });
    expect(chamadas.map((c) => c.aresta)).toEqual(["oauth/access_token", "debug_token"]);
  });

  it("token de pessoa é trocado pelo de longa duração", async () => {
    const { buscar, chamadas } = graph([
      resposta(200, { access_token: "curto" }),
      resposta(200, { data: { type: "USER", scopes: ["ads_read"] } }),
      resposta(200, { access_token: "longo" }),
    ]);

    const r = await tokenDaVolta(p, buscar);

    expect(r.token).toBe("longo");
    expect(chamadas[2]?.corpo.get("grant_type")).toBe("fb_exchange_token");
    expect(chamadas[2]?.corpo.get("fb_exchange_token")).toBe("curto");
  });

  it("inspeção que falha não derruba a conexão: o token é tratado como de pessoa", async () => {
    const { buscar } = graph([
      resposta(200, { access_token: "curto" }),
      resposta(400, { error: { message: "não deu" } }),
      resposta(200, { access_token: "longo" }),
    ]);

    expect(await tokenDaVolta(p, buscar)).toEqual({ token: "longo", inspecao: null });
  });

  it("recusa na troca do código diz onde foi e o que a Meta respondeu", async () => {
    const { buscar } = graph([resposta(400, { error: { message: "código usado" } })]);

    await expect(tokenDaVolta(p, buscar)).rejects.toMatchObject({ onde: "troca_do_codigo", detalhe: "código usado" });
  });

  it("token e segredo vão no corpo, nunca na URL", async () => {
    const { buscar, chamadas } = graph([resposta(200, { data: { type: "SYSTEM_USER" } })]);

    await inspecionarToken({ appId: "app1", appSecret: "seg", token: "tok-secreto" }, buscar);

    expect(chamadas[0]?.url).not.toContain("tok-secreto");
    expect(chamadas[0]?.url).not.toContain("seg");
    expect(chamadas[0]?.corpo.get("input_token")).toBe("tok-secreto");
    expect(chamadas[0]?.corpo.get("method")).toBe("GET");
  });

  it("só as permissões de anúncio contam como conta concedida, sem repetir e sem o prefixo", async () => {
    const { buscar } = graph([
      resposta(200, {
        data: {
          type: "SYSTEM_USER",
          granular_scopes: [
            { scope: "ads_read", target_ids: ["1", "act_2"] },
            { scope: "ads_management", target_ids: ["1"] },
            { scope: "pages_messaging", target_ids: ["77"] },
          ],
        },
      }),
    ]);

    const r = await inspecionarToken({ appId: "a", appSecret: "s", token: "t" }, buscar);

    expect(r.contasConcedidas).toEqual(["1", "2"]);
  });
});
