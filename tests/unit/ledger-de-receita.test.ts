/**
 * LEDGER FINANCEIRO IMUTÁVEL (migration 0416) — o que este arquivo segura:
 *
 *  - só os três eventos que `aplicarEventoDaCakto` já trata viram fato do
 *    ledger; os demais (Pix gerado, abandono, assinatura…) não mapeiam;
 *  - sem valor no aviso, nada é gravado (nunca um fato inventado);
 *  - gravação nova volta `{ id, novo: true }`;
 *  - a MESMA reentrega (23505 na chave de dedupe) volta a linha existente
 *    com `novo: false`, sem duplicar;
 *  - erro real (não é dedupe) NUNCA lança — devolve `null` e loga, porque o
 *    ledger é observação, nunca porta de entrada da compra.
 */
import { describe, expect, it, vi } from "vitest";

import { depsDoLedgerReais, tipoDoEventoDeReceita } from "@/lib/pagamentos/ledger-de-receita";
import type { CompraDaCakto, EventoDaCakto } from "@/lib/webhooks/cakto";

function compra(overrides: Partial<CompraDaCakto> = {}): CompraDaCakto {
  return {
    evento: "purchase_approved",
    pedidoId: "81b408ee-2a91-427d-80bd-226cbeae1fa0",
    refId: "AUAe5xK",
    produtoId: "cd287b31-d4b7-4e94-858a-96e05ce2f4a2",
    produtoNome: "Trabalho Espiritual: Abertura do Coração",
    ofertaNome: "Oferta Única",
    valorCentavos: 5070,
    cupom: "lua50k7q",
    metodo: "pix",
    pagoEm: "2026-09-24T11:39:57.113068-03:00",
    status: "paid",
    cliente: { nome: "Marina", email: "marina@exemplo.com", telefone: "+5511987654321" },
    ...overrides,
  };
}

describe("tipoDoEventoDeReceita — mapeamento puro", () => {
  it("mapeia os três eventos que a compra já trata", () => {
    expect(tipoDoEventoDeReceita("purchase_approved")).toBe("charge");
    expect(tipoDoEventoDeReceita("refund")).toBe("refund");
    expect(tipoDoEventoDeReceita("chargeback")).toBe("chargeback");
  });

  it("não mapeia os demais — não são dinheiro se movendo (ou não são tratados ainda)", () => {
    const semMapa: EventoDaCakto[] = [
      "purchase_refused",
      "pix_gerado",
      "boleto_gerado",
      "picpay_gerado",
      "subscription_canceled",
      "subscription_renewed",
      "checkout_abandonment",
    ];
    for (const evento of semMapa) {
      expect(tipoDoEventoDeReceita(evento)).toBeNull();
    }
  });
});

/** Fake mínimo do client do Supabase — só a forma que `registrarReceita` usa. */
function fakeAdmin(opts: {
  insertResult: { data: { id: string } | null; error: { code: string; message: string } | null };
  existente?: { id: string } | null;
}) {
  const inserted: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    expect(table).toBe("revenue_ledger");
    return {
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return {
          select: () => ({
            single: async () => opts.insertResult,
          }),
        };
      },
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: opts.existente ?? null }),
        };
        return chain;
      },
    };
  });
  return { admin: { from } as never, inserted };
}

describe("depsDoLedgerReais().registrarReceita", () => {
  it("purchase_approved sem valor não grava nada (não inventa fato)", async () => {
    const { admin, inserted } = fakeAdmin({ insertResult: { data: null, error: null } });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    const r = await deps.registrarReceita(compra({ valorCentavos: null }), "contato-1");
    expect(r).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("evento sem mapeamento (ex.: pix_gerado) não grava nada", async () => {
    const { admin, inserted } = fakeAdmin({ insertResult: { data: null, error: null } });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    const r = await deps.registrarReceita(compra({ evento: "pix_gerado" }), "contato-1");
    expect(r).toBeNull();
    expect(inserted).toHaveLength(0);
  });

  it("purchase_approved com valor grava charge novo", async () => {
    const { admin, inserted } = fakeAdmin({ insertResult: { data: { id: "led-1" }, error: null } });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    const r = await deps.registrarReceita(compra(), "contato-1");
    expect(r).toEqual({ id: "led-1", novo: true });
    expect(inserted[0]).toMatchObject({
      organization_id: "org-1",
      event_type: "charge",
      amount_cents: 5070,
      provider: "cakto",
      webhook_source_id: "src-1",
      external_event_id: "81b408ee-2a91-427d-80bd-226cbeae1fa0",
      contact_id: "contato-1",
    });
    // NUNCA nome/e-mail/telefone do cliente no fato gravado.
    expect(JSON.stringify(inserted[0])).not.toContain("marina");
    expect(JSON.stringify(inserted[0])).not.toContain("987654321");
  });

  it("compra sem contato encontrado ainda vira fato: contact_id nulo, valor e pedido preservados", async () => {
    const { admin, inserted } = fakeAdmin({ insertResult: { data: { id: "led-sem-contato" }, error: null } });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    const r = await deps.registrarReceita(compra(), null);
    expect(r).toEqual({ id: "led-sem-contato", novo: true });
    expect(inserted[0]).toMatchObject({
      organization_id: "org-1",
      event_type: "charge",
      amount_cents: 5070,
      contact_id: null,
      external_event_id: "81b408ee-2a91-427d-80bd-226cbeae1fa0",
    });
  });

  it("refund vira event_type=refund; chargeback vira event_type=chargeback", async () => {
    for (const [evento, tipo] of [
      ["refund", "refund"],
      ["chargeback", "chargeback"],
    ] as const) {
      const { admin, inserted } = fakeAdmin({ insertResult: { data: { id: "led-x" }, error: null } });
      const deps = depsDoLedgerReais(admin, "org-1", "src-1");
      await deps.registrarReceita(compra({ evento }), "contato-1");
      expect(inserted[0]).toMatchObject({ event_type: tipo });
    }
  });

  it("reentrega do MESMO aviso (23505) devolve a linha existente, novo:false — não duplica", async () => {
    const { admin, inserted } = fakeAdmin({
      insertResult: { data: null, error: { code: "23505", message: "duplicate key" } },
      existente: { id: "led-ja-existe" },
    });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    const r = await deps.registrarReceita(compra(), "contato-1");
    expect(r).toEqual({ id: "led-ja-existe", novo: false });
    expect(inserted).toHaveLength(1); // tentou inserir — o banco que recusou
  });

  it("erro real (não é dedupe) NUNCA lança — devolve null, a compra segue seu caminho", async () => {
    const { admin } = fakeAdmin({
      insertResult: { data: null, error: { code: "42501", message: "permission denied" } },
    });
    const deps = depsDoLedgerReais(admin, "org-1", "src-1");
    await expect(deps.registrarReceita(compra(), "contato-1")).resolves.toBeNull();
  });
});
