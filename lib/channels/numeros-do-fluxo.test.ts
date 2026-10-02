/**
 * Quem atende cada número, do ponto de vista de um fluxo. É o que o painel do
 * gatilho mostra antes de o dono ligar o vínculo: ele precisa ver de QUEM está
 * tirando o número.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { listarNumerosDoFluxo } from "./numeros-do-fluxo";

const ESTE = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const SUMIDO = "33333333-3333-4333-8333-333333333333";

let filtrosDosCanais: Record<string, unknown>;
let idsDosNomes: string[] | null;
let erroDosCanais: { message: string } | null;

const canal = (
  id: string,
  metadata: unknown,
  apelido: string | null = `Número ${id}`,
  sessao: string | null = null,
  provider = "meta_cloud",
) => ({
  id,
  provider,
  display_name: apelido,
  phone_number: "+5511999990000",
  waha_session_name: sessao,
  metadata,
});

const admin = {
  from(tabela: string) {
    if (tabela === "channel_sessions") {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => {
          filtrosDosCanais[c] = v;
          return q;
        },
        in: () => q,
        is: (c: string, v: unknown) => {
          filtrosDosCanais[c] = v;
          return q;
        },
        order: async () => ({
          data: erroDosCanais
            ? null
            : [
                canal("a", { handling_mode: "flow", default_flow_pointer_id: ESTE }),
                canal("b", { handling_mode: "flow", default_flow_pointer_id: OUTRO }),
                canal("c", { handling_mode: "flow", default_flow_pointer_id: SUMIDO }),
                canal("d", null, null, "sessao-d", "waha"),
                canal("e", { handling_mode: "human" }, null, null),
              ],
          error: erroDosCanais,
        }),
      };
      return q;
    }
    const q = {
      select: () => q,
      eq: () => q,
      in: async (_c: string, ids: string[]) => {
        idsDosNomes = ids;
        return { data: [{ id: OUTRO, name: "Boas-vindas" }], error: null };
      },
    };
    return q;
  },
} as never;

const listar = () => listarNumerosDoFluxo(admin, "org-1", ESTE);

beforeEach(() => {
  filtrosDosCanais = {};
  idsDosNomes = null;
  erroDosCanais = null;
});

describe("listarNumerosDoFluxo", () => {
  it("diz, de cada número, quem atende hoje", async () => {
    const r = await listar();
    expect(r.ok && r.numeros.map((n) => [n.id, n.dono, n.outro_fluxo])).toEqual([
      ["a", "este_fluxo", null],
      ["b", "outro_fluxo", "Boas-vindas"],
      ["c", "outro_fluxo", null], // o fluxo dono foi apagado: sem nome, mas ainda é "outro fluxo"
      ["d", "agente", null],
      ["e", "humano", null],
    ]);
  });

  it("o nome é o apelido; sem apelido, o da sessão; sem nenhum, null (a tela mostra o telefone)", async () => {
    const r = await listar();
    expect(r.ok && r.numeros.map((n) => n.nome)).toEqual(["Número a", "Número b", "Número c", "sessao-d", null]);
  });

  it("diz quais números têm risco de banimento (os pareados por QR) — pela capacidade do canal, sem expor o provedor", async () => {
    const r = await listar();
    expect(r.ok && r.numeros.map((n) => [n.id, n.com_risco_de_banimento])).toEqual([
      ["a", false],
      ["b", false],
      ["c", false],
      ["d", true],
      ["e", false],
    ]);
    expect(r.ok && r.numeros.some((n) => "provider" in n)).toBe(false);
  });

  it("só olha números DESTA organização, e não os arquivados", async () => {
    await listar();
    expect(filtrosDosCanais).toMatchObject({ organization_id: "org-1", archived_at: null });
  });

  it("busca o nome só dos OUTROS fluxos — nunca o deste", async () => {
    await listar();
    expect(idsDosNomes).toEqual([OUTRO, SUMIDO]);
  });

  it("não devolve o metadata cru nem coluna de provedor", async () => {
    const r = await listar();
    expect(r.ok && r.numeros.every((n) => Object.keys(n).sort().join() === "com_risco_de_banimento,dono,id,nome,outro_fluxo,phone_number")).toBe(true);
  });

  it("falha do banco vira resultado de erro, não lista vazia", async () => {
    erroDosCanais = { message: "fora do ar" };
    expect(await listar()).toEqual({ ok: false, message: "fora do ar" });
  });
});
