import { describe, expect, it } from "vitest";

import { comprasRecentesDaPagina, normalizarProduto, primeiroNomeVisivel } from "@/lib/pagamentos/compras-recentes";

describe("primeiroNomeVisivel", () => {
  it("fica só com o primeiro nome, em caixa de nome", () => {
    expect(primeiroNomeVisivel("MARIA  da silva")).toBe("Maria");
    expect(primeiroNomeVisivel("  joão pedro")).toBe("João");
    expect(primeiroNomeVisivel("Ana-Lúcia Souza")).toBe("Ana-lúcia");
  });

  it("recusa o que não é nome", () => {
    expect(primeiroNomeVisivel(null)).toBeNull();
    expect(primeiroNomeVisivel("")).toBeNull();
    expect(primeiroNomeVisivel("A")).toBeNull();
    expect(primeiroNomeVisivel("maria@exemplo.com")).toBeNull();
    expect(primeiroNomeVisivel("11987654321")).toBeNull();
  });
});

describe("normalizarProduto", () => {
  it("ignora emoji, caixa e acento", () => {
    expect(normalizarProduto("🌀 MEGA PACK 3.7 — Mandalas")).toBe("mega pack 3.7 mandalas");
    expect(normalizarProduto("Mandalas de Traço Guiado")).toContain("traco guiado");
  });
});

function fakeAdmin(tokens: string[], linhas: unknown[]) {
  const filtros: Array<[string, string, unknown]> = [];
  const builder = (tabela: string, resultado: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "gte", "order"]) {
      b[m] = (col: string, val: unknown) => {
        filtros.push([tabela, `${m}:${col}`, val]);
        return b;
      };
    }
    b.limit = () => Promise.resolve({ data: resultado, error: null });
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: resultado, error: null }).then(ok);
    return b;
  };
  const admin = {
    from: (tabela: string) =>
      tabela === "webhook_sources" ? builder(tabela, tokens.map((path_token) => ({ path_token }))) : builder(tabela, linhas),
  };
  return { admin: admin as never, filtros };
}

const linha = (id: string, produto: string, nome: string, em = "2026-10-24T12:00:00Z") => ({
  received_at: em,
  external_id: id,
  payload_parsed: { data: { product: { name: produto }, customer: { name: nome, email: "x@y.z", phone: "11999999999" } } },
});

describe("comprasRecentesDaPagina", () => {
  it("sem fonte 'só registro' não mostra nada — nem consulta o arquivo", async () => {
    const { admin, filtros } = fakeAdmin([], [linha("p1", "Mega Pack 3.7", "Maria Silva")]);
    expect(await comprasRecentesDaPagina(admin, "org-1", "Mega Pack 3.7")).toEqual([]);
    expect(filtros.some(([t]) => t === "webhook_events_log")).toBe(false);
  });

  it("filtra pelo produto, conta o pedido reenviado uma vez e devolve só primeiro nome e hora", async () => {
    const { admin, filtros } = fakeAdmin(
      ["tok-pagina"],
      [
        linha("p1", "🌀 MEGA PACK 3.7 — 500 mandalas", "Maria Silva", "2026-10-24T12:00:00Z"),
        linha("p1", "🌀 MEGA PACK 3.7 — 500 mandalas", "Maria Silva", "2026-10-24T11:59:00Z"),
        linha("p2", "Mandalas de Traço Guiado", "Joana Lima"),
        linha("p3", "Mega Pack 3.7", "ana"),
      ],
    );
    const compras = await comprasRecentesDaPagina(admin, "org-1", "mega pack 3.7");
    expect(compras).toEqual([
      { nome: "Maria", em: "2026-10-24T12:00:00Z" },
      { nome: "Ana", em: "2026-10-24T12:00:00Z" },
    ]);
    expect(JSON.stringify(compras)).not.toMatch(/silva|x@y|9999/i);
    expect(filtros).toContainEqual(["webhook_events_log", "in:webhook_path_token", ["tok-pagina"]]);
    expect(filtros).toContainEqual(["webhook_events_log", "eq:event_type", "cakto.purchase_approved"]);
    expect(filtros).toContainEqual(["webhook_sources", "eq:cakto_somente_registro", true]);
  });
});
