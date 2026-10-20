// @vitest-environment node
/**
 * A IMAGEM DE "SUA LUA DO MÊS" SAI DE VERDADE: renderiza a rota com dados de exemplo e confere que volta um PNG.
 * O gerador (next/og) recusa em tempo de execução o que o tipo aceita — bloco com mais de um filho sem
 * `display: flex` —, e isso só aparece renderizando (medido em 19/10/2026, antes do primeiro deploy). Ambiente
 * node: no simulador de navegador a conversão para PNG falha por outro motivo.
 */
import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/idiomaAnonimo", () => ({ idiomaDoVisitante: async () => "pt-BR" }));
vi.mock("@/lib/area-do-cliente/http", () => {
  const tabela = (dados: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "not", "gte", "limit"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: dados });
    q.then = (r: (v: unknown) => unknown) => r({ data: dados });
    return q;
  };
  return {
    NAO_ENCONTRADA: () => new Response("x", { status: 404 }),
    origemPublica: () => "https://acassia.tech",
    contextoDaArea: async () => ({
      org: { id: "o", slug: "magno", nome: "Cigana", fuso: "America/Rio_Branco", config: { titulo: "Cigana Esmeralda", cor: "#7c3aed" } },
      sessao: { contactId: "c", sessaoId: "s" },
      admin: {
        from: (t: string) =>
          t === "contacts"
            ? tabela({ name: "Maria Aparecida", display_name: null })
            : t === "area_leituras"
              ? tabela([
                  { created_at: new Date().toISOString(), cartas: [{ id: 17, nome: "A Torre", posicao: "x", sentido: "s" }, { id: 19, nome: "O Sol", posicao: "x", sentido: "s" }] },
                  { created_at: new Date().toISOString(), cartas: [{ id: 17, nome: "A Torre", posicao: "x", sentido: "s" }] },
                ])
              : tabela([{ created_at: new Date().toISOString() }, { created_at: new Date().toISOString() }, { created_at: new Date().toISOString() }]),
      },
    }),
  };
});

it("⭐ a rota devolve um PNG 1080×1350 com dados de exemplo", async () => {
  const { GET } = await import("@/app/c/[org]/lua-do-mes/route");
  const res = await GET(new NextRequest("https://acassia.tech/c/magno/lua-do-mes"), { params: Promise.resolve({ org: "magno" }) });
  expect(res.status).toBe(200);
  const png = Buffer.from(await res.arrayBuffer());
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
}, 60000);
