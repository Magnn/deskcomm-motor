import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

/**
 * COM MAIS DE UM NÚMERO OFICIAL, A TELA E OS MODELOS USAM O QUE FUNCIONA.
 *
 * Medido em produção em 16/10/2026: a org tinha o número antigo banido (STOPPED)
 * e ia ganhar números novos. "O primeiro criado" escolheria o banido.
 */
describe("escolherCanalOficial", () => {
  it("⭐ prefere o que está funcionando, mesmo sendo mais antigo que um parado", async () => {
    const { escolherCanalOficial } = await import("@/lib/channels/meta/session");
    const escolhido = escolherCanalOficial([
      { id: "banido", status: "STOPPED", created_at: "2026-10-20T00:00:00Z" },
      { id: "novo", status: "WORKING", created_at: "2026-10-16T00:00:00Z" },
    ]);
    expect(escolhido?.id).toBe("novo");
  });

  it("entre os que funcionam, o conectado por último", async () => {
    const { escolherCanalOficial } = await import("@/lib/channels/meta/session");
    const escolhido = escolherCanalOficial([
      { id: "a", status: "WORKING", created_at: "2026-10-16T10:00:00Z" },
      { id: "b", status: "WORKING", created_at: "2026-10-16T12:00:00Z" },
    ]);
    expect(escolhido?.id).toBe("b");
  });

  it("nenhum número: nada", async () => {
    const { escolherCanalOficial } = await import("@/lib/channels/meta/session");
    expect(escolherCanalOficial([])).toBeNull();
  });
});
