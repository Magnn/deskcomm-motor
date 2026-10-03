import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import {
  atribuirReceita,
  lerDadosParaAtribuir,
  SEM_AGENTE,
  SEM_ANUNCIO,
  SEM_CONTATO,
  SEM_FLUXO,
  type DadosParaAtribuir,
} from "./receita-atribuida";

const dados = (over: Partial<DadosParaAtribuir> = {}): DadosParaAtribuir => ({
  fatos: [],
  origens: new Map(),
  agentes: new Map(),
  fluxos: new Map(),
  ...over,
});

describe("atribuirReceita", () => {
  it("venda vai para o anúncio do primeiro toque, o último agente e o último fluxo ANTES da compra", () => {
    const r = atribuirReceita(
      dados({
        fatos: [{ id: "f1", tipo: "charge", valorCentavos: 49_700, ocorridoEm: "2026-10-02T12:00:00.000Z", contatoId: "c1" }],
        origens: new Map([["c1", { plataforma: "meta_ads", anuncioId: "84931", anuncioTitulo: "Promo Outubro" }]]),
        agentes: new Map([
          [
            "c1",
            [
              { id: "a-sdr", nome: "SDR", em: "2026-10-01T10:00:00.000Z" },
              { id: "a-closer", nome: "Closer", em: "2026-10-02T11:00:00.000Z" },
              // Depois da compra: não conta.
              { id: "a-pos", nome: "Pós-venda", em: "2026-10-02T13:00:00.000Z" },
            ],
          ],
        ]),
        fluxos: new Map([["c1", [{ id: "fl-1", nome: "Recuperação 24h", em: "2026-10-01T20:00:00.000Z" }]]]),
      }),
    );
    expect(r).toMatchObject({ receitaLiquidaCentavos: 49_700, receitaBrutaCentavos: 49_700, vendas: 1, ticketMedioCentavos: 49_700 });
    expect(r.porOrigem).toEqual([{ chave: "meta_ads:84931", rotulo: "Meta Ads · Promo Outubro", receitaCentavos: 49_700, vendas: 1 }]);
    expect(r.porAgente[0]).toMatchObject({ chave: "a-closer", rotulo: "Closer" });
    expect(r.porFluxo[0]).toMatchObject({ chave: "fl-1", rotulo: "Recuperação 24h" });
  });

  it("reembolso entra NEGATIVO na mesma origem da venda, e não conta como venda", () => {
    const r = atribuirReceita(
      dados({
        fatos: [
          { id: "f1", tipo: "charge", valorCentavos: 10_000, ocorridoEm: "2026-10-01T00:00:00.000Z", contatoId: "c1" },
          { id: "f2", tipo: "refund", valorCentavos: 10_000, ocorridoEm: "2026-10-03T00:00:00.000Z", contatoId: "c1" },
          { id: "f3", tipo: "charge", valorCentavos: 5_000, ocorridoEm: "2026-10-03T00:00:00.000Z", contatoId: "c2" },
        ],
        origens: new Map([
          ["c1", { plataforma: "google_ads", anuncioId: null, anuncioTitulo: null }],
          ["c2", { plataforma: null, anuncioId: null, anuncioTitulo: null }],
        ]),
      }),
    );
    expect(r).toMatchObject({ receitaLiquidaCentavos: 5_000, receitaBrutaCentavos: 15_000, devolvidoCentavos: 10_000, vendas: 2, ticketMedioCentavos: 7_500 });
    const google = r.porOrigem.find((f) => f.chave === "google_ads:sem_id");
    expect(google).toMatchObject({ receitaCentavos: 0, vendas: 1, rotulo: "Google Ads" });
    expect(r.porOrigem.find((f) => f.chave === SEM_ANUNCIO)?.receitaCentavos).toBe(5_000);
  });

  it("sem contato, sem agente e sem fluxo viram fatias com nome — o dinheiro nunca some do total", () => {
    const r = atribuirReceita(
      dados({
        fatos: [
          { id: "f1", tipo: "charge", valorCentavos: 3_000, ocorridoEm: "2026-10-01T00:00:00.000Z", contatoId: null },
          { id: "f2", tipo: "charge", valorCentavos: 2_000, ocorridoEm: "2026-10-01T00:00:00.000Z", contatoId: "c9" },
        ],
      }),
    );
    for (const fatias of [r.porOrigem, r.porAgente, r.porFluxo]) {
      expect(fatias.reduce((s, f) => s + f.receitaCentavos, 0)).toBe(r.receitaLiquidaCentavos);
    }
    expect(r.porOrigem.map((f) => f.chave).sort()).toEqual([SEM_CONTATO, SEM_ANUNCIO].sort());
    expect(r.porAgente.map((f) => f.chave).sort()).toEqual([SEM_CONTATO, SEM_AGENTE].sort());
    expect(r.porFluxo.map((f) => f.chave).sort()).toEqual([SEM_CONTATO, SEM_FLUXO].sort());
  });

  it("período sem pagamento: tudo zero, ticket zero (sem divisão por zero)", () => {
    expect(atribuirReceita(dados())).toMatchObject({ receitaLiquidaCentavos: 0, vendas: 0, ticketMedioCentavos: 0, porOrigem: [] });
  });
});

describe("lerDadosParaAtribuir", () => {
  it("lê só a organização e o período, e acha o agente PELA CONVERSA (a execução não grava o contato)", async () => {
    const b = criarBancoEmMemoria({
      revenue_ledger: [
        { id: "f1", organization_id: "org-1", event_type: "charge", amount_cents: "9700", occurred_at: "2026-10-02T12:00:00.000Z", contact_id: "c1" },
        { id: "fora", organization_id: "org-1", event_type: "charge", amount_cents: "1", occurred_at: "2026-09-01T00:00:00.000Z", contact_id: "c1" },
        { id: "outra", organization_id: "org-2", event_type: "charge", amount_cents: "1", occurred_at: "2026-10-02T00:00:00.000Z", contact_id: "c1" },
      ],
      contacts: [{ id: "c1", organization_id: "org-1", source_metadata: { ad_platform: "meta_ads", ad_id: "77", ad_title: "Anúncio A" } }],
      conversations: [{ id: "cv1", organization_id: "org-1", contact_id: "c1" }],
      ai_agent_runs: [
        { conversation_id: "cv1", organization_id: "org-1", agent_id: "a1", started_at: "2026-10-02T11:00:00.000Z", is_dry_run: false, status: "completed", contact_id: null },
        { conversation_id: "cv1", organization_id: "org-1", agent_id: "a-teste", started_at: "2026-10-02T11:30:00.000Z", is_dry_run: true, status: "completed", contact_id: null },
      ],
      ai_agents: [{ id: "a1", organization_id: "org-1", name: "Vendedora" }],
      followup_enrollments: [{ organization_id: "org-1", contact_id: "c1", pointer_id: "p1", started_at: "2026-10-01T00:00:00.000Z" }],
      followup_flow_pointers: [{ id: "p1", organization_id: "org-1", name: "Funil do anúncio" }],
    });
    const lido = await lerDadosParaAtribuir(b.cliente as unknown as SupabaseClient, "org-1", {
      inicio: new Date("2026-10-01T00:00:00.000Z"),
      fim: new Date("2026-10-03T00:00:00.000Z"),
    });
    expect(lido.fatos.map((f) => f.id)).toEqual(["f1"]);
    expect(lido.fatos[0]?.valorCentavos).toBe(9700);
    const r = atribuirReceita(lido);
    expect(r.porOrigem[0]?.rotulo).toBe("Meta Ads · Anúncio A");
    // A execução de TESTE (dry run) não é atendimento.
    expect(r.porAgente.map((f) => f.rotulo)).toEqual(["Vendedora"]);
    expect(r.porFluxo[0]?.rotulo).toBe("Funil do anúncio");
  });
});
