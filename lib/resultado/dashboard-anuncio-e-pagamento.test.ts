/**
 * O dashboard deixa de mostrar zero onde não sabe: as vendas do gateway entram no faturamento (sem as
 * estornadas), o gasto de anúncio é lido da conta, e ROAS/lucro só usam o gasto quando ele é conhecido e
 * está na mesma moeda.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { lerGastoDeAnuncios, limparCacheDoGasto, somarGastoEmCentavos, type DepsDoGasto } from "@/lib/plataformas-de-anuncio/meta/gasto-do-periodo";
import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { contasDoAnuncio } from "./contas-do-anuncio";
import { calcularIntervalo, diaNoFuso } from "./periodo";
import { lerVendasDoPagamento, vendasDoLedger } from "./vendas-do-pagamento";

const linha = (id: string, tipo: string, pedido: string, quando: string, over: object = {}) => ({
  id,
  organization_id: "org-1",
  event_type: tipo,
  amount_cents: 13000,
  occurred_at: quando,
  contact_id: "c1",
  external_event_id: pedido,
  ...over,
});

describe("vendasDoLedger", () => {
  it("cobrança vira venda paga; a estornada sai; estorno e ajuste não são venda", () => {
    const vendas = vendasDoLedger(
      [linha("a", "charge", "p1", "2026-10-02T10:00:00Z"), linha("b", "charge", "p2", "2026-10-02T11:00:00Z"), linha("c", "refund", "p2", "2026-10-03T00:00:00Z")],
      new Set(["p2"]),
    );
    expect(vendas).toEqual([
      { id: "a", number: null, contact_id: "c1", status: "paid", total_cents: 13000, created_at: "2026-10-02T10:00:00Z", attendant_user_id: null, notes: null },
    ]);
  });
});

describe("lerVendasDoPagamento", () => {
  const banco = () =>
    criarBancoEmMemoria({
      revenue_ledger: [
        linha("a", "charge", "p1", "2026-10-02T10:00:00.000Z"),
        linha("b", "charge", "p2", "2026-10-02T11:00:00.000Z"),
        // Estorno FORA do período: a venda de ontem devolvida hoje deixa de ser venda de ontem.
        linha("c", "chargeback", "p2", "2026-10-09T00:00:00.000Z"),
        linha("d", "charge", "p3", "2026-09-20T10:00:00.000Z"),
        linha("e", "charge", "p4", "2026-10-02T12:00:00.000Z", { organization_id: "org-2" }),
      ],
    });
  const ler = (de: string, ate: string) =>
    lerVendasDoPagamento(banco().cliente as unknown as SupabaseClient, "org-1", new Date(de), new Date(ate));

  it("traz só as cobranças do período e da organização, sem as estornadas", async () => {
    const vendas = await ler("2026-10-01T00:00:00Z", "2026-10-03T00:00:00Z");
    expect(vendas.map((v) => v.id)).toEqual(["a"]);
    expect(vendas[0]?.total_cents).toBe(13000);
  });

  it("período sem cobrança devolve vazio", async () => {
    expect(await ler("2026-11-01T00:00:00Z", "2026-11-02T00:00:00Z")).toEqual([]);
  });
});

describe("gasto de anúncios", () => {
  beforeEach(() => limparCacheDoGasto());

  const deps = (over: Partial<DepsDoGasto> = {}): DepsDoGasto => ({
    lerCredencial: vi.fn(async () => ({ ok: true as const, credencial: { accessToken: "t", contaPadrao: "act_1" } })),
    lerInsights: vi.fn(async () => ({ ok: true as const, dados: [{ spend: "120.50" }, { spend: "9.5" }, {}, { spend: "x" }] })),
    listarContas: vi.fn(async () => ({ ok: true as const, dados: [{ id: "act_1", nome: "Conta", moeda: "BRL", status: 1 }] })),
    agora: () => 1_000,
    ...over,
  });
  const ler = (d: DepsDoGasto) => lerGastoDeAnuncios({} as SupabaseClient, "org-1", new Date("2026-10-01T03:00:00Z"), new Date("2026-10-04T12:00:00Z"), "America/Sao_Paulo", d);

  it("soma o gasto das campanhas em centavos; linha sem número conta zero", () => {
    expect(somarGastoEmCentavos([{ spend: "120.50" }, { spend: "9.5" }, {}, { spend: "x" }])).toBe(13000);
  });

  it("lê a conta padrão no recorte de dias e devolve o gasto com a moeda da conta", async () => {
    const d = deps();
    expect(await ler(d)).toEqual({ estado: "ok", centavos: 13000, moeda: "BRL" });
    expect(d.lerInsights).toHaveBeenCalledWith("t", "act_1", "2026-10-01", "2026-10-04");
  });

  it("sem conexão, sem conta escolhida e plataforma fora são três respostas diferentes — nenhuma é zero", async () => {
    expect(await ler(deps({ lerCredencial: vi.fn(async () => ({ ok: false as const, motivo: "sem_conexao" as const })) }))).toEqual({ estado: "sem_conexao" });
    expect(
      await ler(deps({ lerCredencial: vi.fn(async () => ({ ok: true as const, credencial: { accessToken: "t", contaPadrao: null } })) })),
    ).toEqual({ estado: "sem_conta" });
    limparCacheDoGasto();
    expect(await ler(deps({ lerInsights: vi.fn(async () => ({ ok: false as const, falha: "token_invalido" as never, detalhe: "" })) }))).toEqual({
      estado: "indisponivel",
    });
  });

  it("a segunda leitura do mesmo período em 5 minutos não chama a plataforma de novo; depois disso, chama", async () => {
    let agora = 1_000;
    const d = deps({ agora: () => agora });
    await ler(d);
    await ler(d);
    expect(d.lerInsights).toHaveBeenCalledTimes(1);
    agora += 5 * 60 * 1000 + 1;
    await ler(d);
    expect(d.lerInsights).toHaveBeenCalledTimes(2);
  });

  it("moeda desconhecida não vira real", async () => {
    const d = deps({ listarContas: vi.fn(async () => ({ ok: false as const, falha: "rede" as never, detalhe: "" })) });
    expect(await ler(d)).toEqual({ estado: "ok", centavos: 13000, moeda: "?" });
  });
});

describe("contasDoAnuncio", () => {
  it("gasto conhecido em real: ROAS e lucro descontam o anúncio", () => {
    expect(contasDoAnuncio(650, { estado: "ok", centavos: 13000, moeda: "BRL" })).toEqual({
      gasto: 130, moeda: "BRL", estado: "ok", roas: 5, lucro: 520, gastoNaConta: true,
    });
  });

  it("gasto desconhecido: ROAS nulo (não zero) e o lucro não desconta anúncio", () => {
    for (const estado of ["sem_conexao", "sem_conta", "indisponivel", "restrito"] as const) {
      expect(contasDoAnuncio(650, { estado })).toEqual({ gasto: null, moeda: null, estado, roas: null, lucro: 650, gastoNaConta: false });
    }
  });

  it("gasto zero não divide; gasto em outra moeda aparece mas não entra na conta", () => {
    expect(contasDoAnuncio(650, { estado: "ok", centavos: 0, moeda: "BRL" }).roas).toBeNull();
    expect(contasDoAnuncio(650, { estado: "ok", centavos: 5000, moeda: "USD" })).toMatchObject({ gasto: 50, roas: null, lucro: 650, gastoNaConta: false });
  });
});

describe("o período no fuso da organização", () => {
  const SP = "America/Sao_Paulo";
  // O caso medido em produção: 21h56 de 04/10 em São Paulo, com o servidor (UTC) já em 05/10.
  const agora = new Date("2026-10-05T00:56:53Z");

  it("'hoje' às 21h56 de São Paulo é o dia 4 inteiro, e não o dia 5 de Londres", () => {
    const { start, end } = calcularIntervalo("today", agora, SP);
    expect(start.toISOString()).toBe("2026-10-04T03:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-05T00:56:53.000Z");
    expect(diaNoFuso(start, SP)).toBe("2026-10-04");
    expect(diaNoFuso(end, SP)).toBe("2026-10-04");
  });

  it("o gasto de 'hoje' é pedido para o dia da organização", async () => {
    limparCacheDoGasto();
    const lerInsights = vi.fn(async () => ({ ok: true as const, dados: [{ spend: "50" }] }));
    const { start, end } = calcularIntervalo("today", agora, SP);
    await lerGastoDeAnuncios({} as SupabaseClient, "org-1", start, end, SP, {
      lerCredencial: vi.fn(async () => ({ ok: true as const, credencial: { accessToken: "t", contaPadrao: "act_1" } })),
      lerInsights,
      listarContas: vi.fn(async () => ({ ok: true as const, dados: [] })),
      agora: () => 1,
    });
    expect(lerInsights).toHaveBeenCalledWith("t", "act_1", "2026-10-04", "2026-10-04");
  });

  it("'ontem', 'este mês' e 'mês passado' viram dias inteiros no fuso; o anterior tem a mesma duração", () => {
    const ontem = calcularIntervalo("yesterday", agora, SP);
    expect([ontem.start.toISOString(), ontem.end.toISOString()]).toEqual(["2026-10-03T03:00:00.000Z", "2026-10-04T02:59:59.999Z"]);
    expect(calcularIntervalo("this_month", agora, SP).start.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    const passado = calcularIntervalo("last_month", agora, SP);
    expect([passado.start.toISOString(), passado.end.toISOString()]).toEqual(["2026-09-01T03:00:00.000Z", "2026-10-01T02:59:59.999Z"]);
    expect(ontem.prevEnd.getTime() - ontem.prevStart.getTime()).toBe(ontem.end.getTime() - ontem.start.getTime());
  });

  it("dia 31 não estoura o 'mês passado' (março → fevereiro), e outro fuso dá outro dia", () => {
    const marco = calcularIntervalo("last_month", new Date("2026-03-31T15:00:00Z"), SP);
    expect(diaNoFuso(marco.start, SP)).toBe("2026-02-01");
    expect(diaNoFuso(marco.end, SP)).toBe("2026-02-28");
    expect(diaNoFuso(agora, "Europe/Lisbon")).toBe("2026-10-05");
  });
});
