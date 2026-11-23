import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { reportar } = vi.hoisted(() => ({ reportar: vi.fn() }));
vi.mock("./compra-avulsa", () => ({ reportarCompraAvulsa: reportar }));
import { recuperarAvulsas, referenciaDaAvulsa } from "./recuperar-avulsas";

const agora = new Date("2026-11-23T15:00:00Z");
const pendente = { id: "d1", organization_id: "org-a", lead_id: "lead-original", event_id: "avulsa:manual-pix:Purchase", attempted_at: "2026-11-20T10:00:00Z", value_cents: 1500, currency: "BRL" };
const cobranca = { id: "r1", amount_cents: 1500, currency: "BRL", occurred_at: "2026-11-20T09:00:00Z", metadata: { produto: "Extra" }, provider: "manual" };

/** Client ordenado que verifica os filtros tenant-aware de cada consulta. */
function banco(resultados: Array<{ tabela: string; data: unknown; error?: { message: string } | null }>) {
  const consultas: Array<{ tabela: string; filtros: Record<string, unknown>; update?: unknown }> = [];
  const db = {
    from(tabela: string) {
      const resposta = resultados.shift();
      expect(tabela).toBe(resposta?.tabela);
      const consulta = { tabela, filtros: {} as Record<string, unknown>, update: undefined as unknown };
      consultas.push(consulta);
      const resultado = { data: resposta?.data, error: resposta?.error ?? null };
      const cadeia = {
        select: () => cadeia, order: () => cadeia, limit: () => cadeia,
        eq: (k: string, v: unknown) => { consulta.filtros[k] = v; return cadeia; },
        gte: (k: string, v: unknown) => { consulta.filtros[`gte:${k}`] = v; return cadeia; },
        lte: (k: string, v: unknown) => { consulta.filtros[`lte:${k}`] = v; return cadeia; },
        in: (k: string, v: unknown) => { consulta.filtros[k] = v; return cadeia; },
        update: (v: unknown) => { consulta.update = v; return cadeia; },
        maybeSingle: async () => resultado,
        then: (resolve: (r: unknown) => unknown) => Promise.resolve(resultado).then(resolve),
      };
      return cadeia;
    },
  } as unknown as SupabaseClient;
  return { db, consultas };
}

function respostas(refund: unknown[] = [], ajustes: unknown[] = [], charge = cobranca) {
  return [
    { tabela: "ad_conversion_dispatches", data: [pendente] },
    { tabela: "ad_conversion_dispatches", data: { id: "d1" } },
    { tabela: "crm_leads", data: { contact_id: "contact-a" } },
    { tabela: "revenue_ledger", data: charge },
    { tabela: "revenue_ledger", data: refund },
    { tabela: "revenue_ledger", data: ajustes },
  ];
}

describe("recuperação durável de compras avulsas", () => {
  beforeEach(() => reportar.mockReset().mockResolvedValue({ status: "sent" }));

  it("reenvia o valor, moeda, referência, negócio e instante ORIGINAIS, com isolamento por organização", async () => {
    const { db, consultas } = banco(respostas());
    expect(await recuperarAvulsas(db, agora)).toEqual({ tentadas: 1, enviadas: 1 });
    expect(reportar).toHaveBeenCalledWith(db, {
      organizationId: "org-a", contactId: "contact-a", negocioId: "lead-original",
      referencia: "manual-pix", valorCentavos: 1500, moeda: "BRL",
      ocorridaEm: new Date(cobranca.occurred_at), produto: "Extra",
    });
    for (const c of consultas.slice(1)) expect(c.filtros.organization_id).toBe("org-a");
    expect(consultas[0]?.filtros).toMatchObject({ status: "error", reason: "plataforma_instavel" });
    expect(consultas[1]?.filtros.attempted_at).toBe(pendente.attempted_at);
  });

  it.each(["estorno", "ajuste"])("não recupera cobrança com %s", async (tipo) => {
    const { db } = banco(respostas(tipo === "estorno" ? [{ id: "refund" }] : [], tipo === "ajuste" ? [{ id: "adjust" }] : []));
    expect(await recuperarAvulsas(db, agora)).toEqual({ tentadas: 0, enviadas: 0 });
    expect(reportar).not.toHaveBeenCalled();
  });

  it("não disputa a compra já reivindicada por outro cron", async () => {
    const { db } = banco([{ tabela: "ad_conversion_dispatches", data: [pendente] }, { tabela: "ad_conversion_dispatches", data: null }]);
    await recuperarAvulsas(db, agora);
    expect(reportar).not.toHaveBeenCalled();
  });

  it.each([
    { ...cobranca, amount_cents: 9999 },
    { ...cobranca, occurred_at: "2026-11-01T00:00:00Z" },
    { ...cobranca, occurred_at: "2026-12-01T00:00:00Z" },
  ])("não troca valor nem inventa data para recuperar cobrança", async (charge) => {
    const { db } = banco(respostas([], [], charge));
    await recuperarAvulsas(db, agora);
    expect(reportar).not.toHaveBeenCalled();
  });

  it("falha de leitura dos estornos nunca permite o envio", async () => {
    const r = respostas();
    const { db } = banco(r.map((x, i) => i === 4 ? { ...x, error: { message: "rede" } } : x));
    await recuperarAvulsas(db, agora);
    expect(reportar).not.toHaveBeenCalled();
  });

  it("extrai somente a referência de compra avulsa, preservando dois-pontos", () => {
    expect(referenciaDaAvulsa("avulsa:a:b:Purchase")).toBe("a:b");
    expect(referenciaDaAvulsa("lead:Purchase")).toBeNull();
    expect(referenciaDaAvulsa("avulsa::Purchase")).toBeNull();
  });
});
