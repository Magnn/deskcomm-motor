import { afterEach, describe, expect, it, vi } from "vitest";

const app = vi.hoisted(() => ({ atual: { appId: "app1", appSecret: "seg", configId: null } as unknown }));
vi.mock("./login", () => ({ appDoMetaAds: async () => app.atual }));

import { listarContas } from "./insights";

const conta = { account_id: "123", name: "Loja", currency: "BRL", account_status: 1 };

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** Responde por aresta: a chave é o fim do caminho da Graph. */
function graph(porAresta: Record<string, () => Response>) {
  const chamadas: string[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request) => {
    const caminho = new URL(String(entrada)).pathname;
    chamadas.push(caminho.split("/").slice(2).join("/"));
    const aresta = Object.keys(porAresta).find((a) => caminho.endsWith(a));
    if (!aresta) throw new Error(`aresta não prevista: ${caminho}`);
    return porAresta[aresta]!();
  });
  vi.stubGlobal("fetch", buscar);
  return chamadas;
}

const semPermissao = () => resposta(403, { error: { code: 200, message: "(#200) Missing Permissions" } });

afterEach(() => {
  vi.unstubAllGlobals();
  app.atual = { appId: "app1", appSecret: "seg", configId: null };
});

describe("as contas que o token alcança", () => {
  it("token de pessoa: lista por me/adaccounts e não pergunta mais nada", async () => {
    const chamadas = graph({ "/me/adaccounts": () => resposta(200, { data: [conta] }) });

    const r = await listarContas("tok");

    expect(r).toEqual({ ok: true, dados: [{ id: "act_123", nome: "Loja", moeda: "BRL", status: 1 }] });
    expect(chamadas).toEqual(["me/adaccounts"]);
  });

  it("token de usuário do sistema: lê, pelo id, as contas que o consentimento concedeu", async () => {
    const chamadas = graph({
      "/me/adaccounts": semPermissao,
      "/debug_token": () =>
        resposta(200, {
          data: { type: "SYSTEM_USER", scopes: ["ads_read"], granular_scopes: [{ scope: "ads_read", target_ids: ["123"] }] },
        }),
      "/act_123": () => resposta(200, conta),
    });

    const r = await listarContas("tok");

    expect(r).toEqual({ ok: true, dados: [{ id: "act_123", nome: "Loja", moeda: "BRL", status: 1 }] });
    expect(chamadas).toEqual(["me/adaccounts", "debug_token", "act_123"]);
  });

  it("consentimento sem conta nenhuma: volta a recusa da primeira leitura", async () => {
    graph({
      "/me/adaccounts": semPermissao,
      "/debug_token": () => resposta(200, { data: { type: "SYSTEM_USER", scopes: [], granular_scopes: [] } }),
    });

    const r = await listarContas("tok");

    expect(r).toMatchObject({ ok: false, falha: "permissao_insuficiente", detalhe: "(#200) Missing Permissions" });
  });

  it("instalação sem o app da Meta: não há a quem perguntar, fica a recusa", async () => {
    app.atual = null;
    const chamadas = graph({ "/me/adaccounts": semPermissao });

    const r = await listarContas("tok");

    expect(r).toMatchObject({ ok: false, falha: "permissao_insuficiente" });
    expect(chamadas).toEqual(["me/adaccounts"]);
  });

  it("conta concedida que a Meta recusa ler devolve essa recusa, não uma lista pela metade", async () => {
    graph({
      "/me/adaccounts": semPermissao,
      "/debug_token": () =>
        resposta(200, { data: { type: "SYSTEM_USER", granular_scopes: [{ scope: "ads_read", target_ids: ["123"] }] } }),
      "/act_123": () => resposta(401, { error: { code: 190, message: "venceu" } }),
    });

    expect(await listarContas("tok")).toMatchObject({ ok: false, falha: "token_invalido" });
  });

  it("token vencido não é perguntado de outro jeito", async () => {
    const chamadas = graph({ "/me/adaccounts": () => resposta(401, { error: { code: 190, message: "venceu" } }) });

    const r = await listarContas("tok");

    expect(r).toMatchObject({ ok: false, falha: "token_invalido" });
    expect(chamadas).toEqual(["me/adaccounts"]);
  });
});
