import { afterEach, describe, expect, it, vi } from "vitest";

import { listarContas } from "./insights";

const conta = { account_id: "123", name: "Loja", currency: "BRL", account_status: 1 };

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** Responde por aresta: a chave é o trecho do caminho da Graph. */
function graph(porAresta: Record<string, () => Response>) {
  const chamadas: string[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request) => {
    const caminho = new URL(String(entrada)).pathname;
    chamadas.push(caminho);
    const aresta = Object.keys(porAresta).find((a) => caminho.endsWith(a));
    if (!aresta) throw new Error(`aresta não prevista: ${caminho}`);
    return porAresta[aresta]!();
  });
  vi.stubGlobal("fetch", buscar);
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe("as contas que o token alcança", () => {
  it("token de pessoa: lista por me/adaccounts e não toca na outra aresta", async () => {
    const chamadas = graph({ "/me/adaccounts": () => resposta(200, { data: [conta] }) });

    const r = await listarContas("tok");

    expect(r).toEqual({ ok: true, dados: [{ id: "act_123", nome: "Loja", moeda: "BRL", status: 1 }] });
    expect(chamadas).toHaveLength(1);
  });

  it("token de usuário do sistema: a recusa de permissão leva às contas atribuídas", async () => {
    const chamadas = graph({
      "/me/adaccounts": () => resposta(403, { error: { code: 200, message: "sem permissão" } }),
      "/me/assigned_ad_accounts": () => resposta(200, { data: [conta] }),
    });

    const r = await listarContas("tok");

    expect(r.ok && r.dados.map((c) => c.id)).toEqual(["act_123"]);
    expect(chamadas.map((c) => c.split("/me/")[1])).toEqual(["adaccounts", "assigned_ad_accounts"]);
  });

  it("as duas arestas recusam: volta a recusa da primeira", async () => {
    graph({
      "/me/adaccounts": () => resposta(403, { error: { code: 200, message: "primeira" } }),
      "/me/assigned_ad_accounts": () => resposta(400, { error: { code: 100, message: "segunda" } }),
    });

    const r = await listarContas("tok");

    expect(r).toMatchObject({ ok: false, falha: "permissao_insuficiente", detalhe: "primeira" });
  });

  it("token vencido não é repetido noutra aresta", async () => {
    const chamadas = graph({ "/me/adaccounts": () => resposta(401, { error: { code: 190, message: "venceu" } }) });

    const r = await listarContas("tok");

    expect(r).toMatchObject({ ok: false, falha: "token_invalido" });
    expect(chamadas).toHaveLength(1);
  });
});
