/**
 * RESULTADO POR ANÚNCIO — o funil do banco ao lado do gasto da plataforma.
 *
 * A tela existe para responder "quanto custou cada venda deste criativo". Os testes seguram as três
 * regras que impedem um número bonito e errado: gasto desconhecido não é zero, sem venda não há
 * custo por venda, e o total só tem custo quando nenhum anúncio ficou sem gasto.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  anunciosParaLerGasto,
  montarResultadoPorAnuncio,
  type FunilDoAnuncio,
  type GastoDoAnuncio,
} from "@/lib/anuncio/resultado-por-anuncio";

const funil = (parte: Partial<FunilDoAnuncio>): FunilDoAnuncio => ({
  anuncio: "111",
  titulo: "Criativo",
  leads: 0,
  engajaram: 0,
  ouviram_preco: 0,
  receberam_link: 0,
  compradores: 0,
  compras: 0,
  receita_cents: 0,
  ...parte,
});
const gasto = (cents: number, nome = "Vídeo A"): GastoDoAnuncio => ({ gastoCents: cents, impressoes: 1000, nome, campanha: "Campanha" });

describe("montarResultadoPorAnuncio", () => {
  const linhas = [
    funil({ anuncio: "111", leads: 200, engajaram: 180, ouviram_preco: 100, receberam_link: 90, compradores: 4, compras: 5, receita_cents: 56_500 }),
    funil({ anuncio: "222", leads: 50, compradores: 0, receita_cents: 0 }),
    funil({ anuncio: null, titulo: null, leads: 500, compradores: 11, compras: 11, receita_cents: 141_687 }),
  ];

  it("⭐ custo por lead, custo por venda e retorno saem do gasto lido e das vendas reais", () => {
    const r = montarResultadoPorAnuncio(linhas, new Map([["111", gasto(40_000)], ["222", gasto(10_000)]]));
    const a = r.linhas[0]!;
    expect(a).toMatchObject({ anuncio: "111", nome: "Vídeo A", leads: 200, compradores: 4, conversaoPct: 2, gastoCents: 40_000 });
    expect(a.custoPorLeadCents).toBe(200);
    expect(a.custoPorVendaCents).toBe(10_000);
    expect(a.retorno).toBe(1.41);
  });

  it("⭐ anúncio que gastou e não vendeu: custo por venda é desconhecido (null), nunca zero", () => {
    const r = montarResultadoPorAnuncio(linhas, new Map([["111", gasto(40_000)], ["222", gasto(10_000)]]));
    const b = r.linhas[1]!;
    expect(b.gastoCents).toBe(10_000);
    expect(b.custoPorVendaCents).toBeNull();
    expect(b.retorno).toBe(0);
  });

  it("⭐ gasto não lido é null — e aí custo e retorno também, em vez de 'saiu de graça'", () => {
    const r = montarResultadoPorAnuncio(linhas, new Map([["111", gasto(40_000)]]));
    const b = r.linhas.find((l) => l.anuncio === "222")!;
    expect(b.gastoCents).toBeNull();
    expect(b.custoPorLeadCents).toBeNull();
    expect(b.retorno).toBeNull();
    expect(r.semGasto).toBe(1);
    // O total com gasto parcial não mostra custo: somaria só parte do gasto contra todas as vendas.
    expect(r.total.gastoCents).toBeNull();
    expect(r.total.custoPorVendaCents).toBeNull();
  });

  it("o total soma só os anúncios identificados, e tem custo quando todos têm gasto", () => {
    const r = montarResultadoPorAnuncio(linhas, new Map([["111", gasto(40_000)], ["222", gasto(10_000)]]));
    expect(r.total).toMatchObject({ leads: 250, compradores: 4, receitaCents: 56_500, gastoCents: 50_000, custoPorVendaCents: 12_500 });
    expect(r.semGasto).toBe(0);
  });

  it("quem entrou sem anúncio identificado fica numa linha própria, no fim, sem gasto", () => {
    const r = montarResultadoPorAnuncio(linhas, new Map());
    const ultima = r.linhas.at(-1)!;
    expect(ultima).toMatchObject({ anuncio: null, leads: 500, compradores: 11, gastoCents: null });
  });

  it("ordena pelos que mais trouxeram gente; sem gasto lido, o nome é o título que o contato guardou", () => {
    const r = montarResultadoPorAnuncio([funil({ anuncio: "a", leads: 3, titulo: "Título do clique" }), funil({ anuncio: "b", leads: 9 })], new Map());
    expect(r.linhas.map((l) => l.anuncio)).toEqual(["b", "a"]);
    expect(r.linhas[1]!.nome).toBe("Título do clique");
  });

  it("período sem ninguém: nada quebra", () => {
    const r = montarResultadoPorAnuncio([], new Map());
    expect(r.linhas).toEqual([]);
    expect(r.total).toMatchObject({ leads: 0, conversaoPct: 0, gastoCents: null });
  });
});

describe("quais anúncios têm o gasto lido", () => {
  it("os que mais trouxeram gente, até o teto, e nunca a linha sem anúncio", () => {
    const lista = [funil({ anuncio: "a", leads: 5 }), funil({ anuncio: null, leads: 999 }), funil({ anuncio: "b", leads: 50 }), funil({ anuncio: "c", leads: 20 })];
    expect(anunciosParaLerGasto(lista, 2)).toEqual(["b", "c"]);
  });
});

describe("a fiação", () => {
  it("a rota soma pelo banco e responde mesmo sem conexão de leitura do gasto", () => {
    const rota = readFileSync("app/api/v1/ads/resultado-por-anuncio/route.ts", "utf8");
    expect(rota).toContain('admin.rpc("fn_resultado_por_anuncio"');
    expect(rota).toContain('requireRole("manager"');
    // Sem credencial: aviso e gasto vazio, não erro.
    expect(rota).toContain("if (!credencial.ok) {");
    expect(rota).not.toContain("respostaSemConexao");
  });

  it("⭐ o gasto é lido pelas contas antes de perguntar anúncio por anúncio, e o que fica sem consulta é avisado", () => {
    const leitura = readFileSync("lib/plataformas-de-anuncio/meta/insights.ts", "utf8");
    const corpo = leitura.slice(leitura.indexOf("export async function lerGastoPorAnuncio("));
    // A leitura por conta vem primeiro: é ela que cobre quem tem mais anúncios que o teto.
    expect(corpo.indexOf('level: "ad"')).toBeGreaterThan(-1);
    expect(corpo.indexOf('level: "ad"')).toBeLessThan(corpo.indexOf('"gasto_do_anuncio"'));
    expect(corpo).toContain("naoConsultados");
    const rota = readFileSync("app/api/v1/ads/resultado-por-anuncio/route.ts", "utf8");
    expect(rota).toContain("if (lido.naoConsultados > 0) {");
  });

  it("a função do banco julga o anúncio por quem ele trouxe e tira os estornos da receita", () => {
    const baseline = readFileSync("supabase/baseline.sql", "utf8");
    const corpo = baseline.slice(baseline.lastIndexOf("create or replace function public.fn_resultado_por_anuncio("));
    const funcao = corpo.slice(0, corpo.indexOf("$function$;"));
    expect(funcao).toContain("c.source_metadata->>'ad_id'");
    expect(funcao).toContain("c.created_at >= p_de and c.created_at <= p_ate");
    expect(funcao).toContain("e.event_type in ('refund', 'chargeback')");
  });

  it("a tela tem porta na navegação", () => {
    expect(readFileSync("lib/navigation/catalogo.ts", "utf8")).toContain('href: "/app/ads/resultado"');
  });
});
