/**
 * A LEITURA DA AGENDA VAI EM LOTES — a lista de contatos viaja na URL.
 *
 * Medido em produção em 09/10/2026: com ~1.300 contatos, `contact_id=in.(…)` passava de 48 KB e o
 * PostgREST recusava o pedido (400). A leitura falhava em TODA rodada, o vigia de risco abortava
 * com `risk_agenda_indisponivel` a cada 30 minutos e o log recebia 10,8 mil avisos por dia.
 */
import { describe, expect, it, vi } from "vitest";

const avisos = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: avisos.warn, error: vi.fn(), info: vi.fn() } }));

import { CONTATOS_POR_PEDIDO, protecaoAgendaSupabase } from "@/lib/agenda/protecao-followup";

function bancoQueRecusaListaGrande(limite: number) {
  const lotes: number[] = [];
  const db = {
    from(tabela: string) {
      if (tabela === "organizations") {
        const q = { select: () => q, eq: () => q, single: async () => ({ data: { settings: {} }, error: null }) };
        return q;
      }
      let tamanho = 0;
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit", "gt"]) q[m] = () => q;
      q.in = (coluna: string, valores: string[]) => {
        if (coluna === "contact_id") {
          tamanho = valores.length;
          lotes.push(tamanho);
        }
        return q;
      };
      q.then = (resolver: (r: unknown) => unknown) =>
        resolver(tamanho > limite ? { data: null, error: { message: "URI too long" } } : { data: [], error: null });
      return q;
    },
  };
  return { db: db as never, lotes };
}

const contatos = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

describe("protecaoAgendaSupabase", () => {
  it("⭐ 1.300 contatos: nenhum pedido leva mais que o lote, e a leitura conclui", async () => {
    const { db, lotes } = bancoQueRecusaListaGrande(CONTATOS_POR_PEDIDO);
    const mapa = await protecaoAgendaSupabase(db, "org", contatos(1300));
    expect(Math.max(...lotes)).toBeLessThanOrEqual(CONTATOS_POR_PEDIDO);
    expect(lotes.reduce((a, b) => a + b, 0)).toBe(1300);
    expect(mapa.size).toBe(1300);
    expect([...mapa.values()].every((p) => p.motivo === "sem_compromisso")).toBe(true);
  });

  it("quando a leitura falha, UM aviso com o motivo — não um por contato", async () => {
    avisos.warn.mockClear();
    const { db } = bancoQueRecusaListaGrande(0);
    const mapa = await protecaoAgendaSupabase(db, "org", contatos(40));
    expect([...mapa.values()].every((p) => p.motivo === "leitura_indisponivel")).toBe(true);
    expect(avisos.warn).toHaveBeenCalledTimes(1);
    expect(avisos.warn.mock.calls[0]?.[1]).toMatchObject({ contatos: 40, motivo: "URI too long" });
  });
});
