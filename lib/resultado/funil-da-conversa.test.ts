import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { lerConversasParaFunil, montarFunil, ondeParou, type ConversaParaFunil } from "./funil-da-conversa";

const c = (over: Partial<ConversaParaFunil>): ConversaParaFunil => ({
  id: "x",
  contatoId: "c",
  criadaEm: "2026-10-01T10:00:00.000Z",
  ultimaEntradaEm: "2026-10-01T10:00:00.000Z",
  ultimaSaidaEm: null,
  ofertaEm: null,
  temObjecao: false,
  comprou: false,
  ...over,
});

describe("ondeParou", () => {
  it("cada conversa cai em UMA casa, a mais avançada", () => {
    expect(ondeParou(c({}))).toBe("sem_atendimento");
    expect(ondeParou(c({ ultimaSaidaEm: "2026-10-01T10:05:00.000Z" }))).toBe("atendida_sem_oferta");
    const comOferta = { ultimaSaidaEm: "2026-10-01T10:10:00.000Z", ofertaEm: "2026-10-01T10:10:00.000Z" };
    // A pessoa não falou depois da oferta.
    expect(ondeParou(c({ ...comOferta, ultimaEntradaEm: "2026-10-01T10:09:00.000Z" }))).toBe("oferta_sem_resposta");
    expect(ondeParou(c({ ...comOferta, ultimaEntradaEm: "2026-10-01T10:20:00.000Z" }))).toBe("conversou_e_nao_comprou");
    expect(ondeParou(c({ ...comOferta, ultimaEntradaEm: "2026-10-01T10:20:00.000Z", temObjecao: true }))).toBe("objecao_sem_compra");
    // Comprou vence qualquer parada, inclusive a objeção.
    expect(ondeParou(c({ ...comOferta, temObjecao: true, comprou: true }))).toBe("comprou");
  });
});

describe("montarFunil", () => {
  it("as paradas mais 'compraram' somam exatamente o total do período", () => {
    const conversas = [
      c({ id: "1" }),
      c({ id: "2", ultimaSaidaEm: "2026-10-01T10:05:00.000Z" }),
      c({ id: "3", ultimaSaidaEm: "2026-10-01T10:10:00.000Z", ofertaEm: "2026-10-01T10:10:00.000Z" }),
      c({ id: "4", ultimaSaidaEm: "2026-10-01T10:10:00.000Z", ofertaEm: "2026-10-01T10:10:00.000Z", comprou: true }),
    ];
    const f = montarFunil(conversas);
    expect(f.etapas).toEqual([
      { chave: "iniciadas", total: 4 },
      { chave: "atendidas", total: 3 },
      { chave: "com_oferta", total: 2 },
      { chave: "compraram", total: 1 },
    ]);
    const paradas = f.paradas.reduce((s, p) => s + p.total, 0);
    expect(paradas + 1).toBe(conversas.length);
    expect(f.paradas.find((p) => p.chave === "oferta_sem_resposta")).toMatchObject({ total: 1, conversas: ["3"] });
  });
});

describe("lerConversasParaFunil", () => {
  it("só a organização e o período; a venda só conta se veio DEPOIS de a conversa começar", async () => {
    const b = criarBancoEmMemoria({
      conversations: [
        { id: "cv1", organization_id: "org-1", contact_id: "c1", is_group: false, created_at: "2026-10-02T10:00:00.000Z", last_inbound_at: "2026-10-02T10:30:00.000Z", last_outbound_at: "2026-10-02T10:20:00.000Z" },
        { id: "cv2", organization_id: "org-1", contact_id: "c2", is_group: false, created_at: "2026-10-02T11:00:00.000Z", last_inbound_at: "2026-10-02T11:00:00.000Z", last_outbound_at: null },
        { id: "grupo", organization_id: "org-1", contact_id: null, is_group: true, created_at: "2026-10-02T11:00:00.000Z", last_inbound_at: null, last_outbound_at: null },
        { id: "fora", organization_id: "org-1", contact_id: "c1", is_group: false, created_at: "2026-09-01T00:00:00.000Z", last_inbound_at: null, last_outbound_at: null },
        { id: "outra", organization_id: "org-2", contact_id: "c9", is_group: false, created_at: "2026-10-02T10:00:00.000Z", last_inbound_at: null, last_outbound_at: null },
      ],
      conversation_milestones: [
        { organization_id: "org-1", conversation_id: "cv1", kind: "oferta_apresentada", occurred_at: "2026-10-02T10:20:00.000Z" },
        { organization_id: "org-1", conversation_id: "cv1", kind: "objecao", occurred_at: "2026-10-02T10:30:00.000Z" },
      ],
      revenue_ledger: [
        { organization_id: "org-1", contact_id: "c1", event_type: "charge", occurred_at: "2026-10-02T12:00:00.000Z" },
        // Venda ANTIGA do c2, de antes desta conversa: não é desta conversa.
        { organization_id: "org-1", contact_id: "c2", event_type: "charge", occurred_at: "2026-08-01T00:00:00.000Z" },
      ],
    });
    const { conversas, cortado } = await lerConversasParaFunil(b.cliente as unknown as SupabaseClient, "org-1", {
      inicio: new Date("2026-10-01T00:00:00.000Z"),
      fim: new Date("2026-10-03T00:00:00.000Z"),
    });
    expect(cortado).toBe(false);
    expect(conversas.map((x) => x.id)).toEqual(["cv1", "cv2"]);
    expect(conversas[0]).toMatchObject({ ofertaEm: "2026-10-02T10:20:00.000Z", temObjecao: true, comprou: true });
    expect(conversas[1]).toMatchObject({ ofertaEm: null, comprou: false });
  });
});
