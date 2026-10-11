/**
 * O PAGAMENTO QUE ENTROU POR FORA DO CHECKOUT.
 *
 * Caso medido em produção em 11/10/2026: Pix direto na chave da empresa. O checkout nunca soube, o
 * contato seguiu como "não pagou", o negócio ficou aberto e sem valor, e a venda não foi reportada.
 * O que estes testes seguram é a ORDEM e as salvaguardas do registro manual.
 */
import { describe, expect, it } from "vitest";

import type { NegocioDoContato } from "@/lib/pagamentos/compra-cakto";
import {
  pagamentoRecebidoSchema,
  registrarPagamentoRecebido,
  sugestoesDePagamento,
  type DepsDoPagamento,
  type PagamentoRecebido,
} from "@/lib/pagamentos/pagamento-recebido";

const CHAVE = "7b1b6f0e-3c1d-4d0a-9c53-9d0a2f6b1e11";
const AGORA = new Date("2026-10-11T18:39:00Z");
const PAGAMENTO: PagamentoRecebido = pagamentoRecebidoSchema.parse({ chave: CHAVE, valor_cents: 13000, produto: "Abertura do Coração" });

const aberto: NegocioDoContato = { id: "neg-aberto", status: "open", value_cents: null, closed_at: null, last_activity_at: "2026-10-11T17:00:00Z", created_at: "2026-10-10T18:00:00Z" };
const ganho: NegocioDoContato = { id: "neg-ganho", status: "won", value_cents: 13000, closed_at: "2026-10-11T12:00:00Z", last_activity_at: null, created_at: "2026-10-09T18:00:00Z" };

function dublês(opts: { tags?: string[]; negocios?: NegocioDoContato[]; fecha?: boolean; fluxo?: string | null; inscreve?: boolean; semContato?: boolean } = {}) {
  const passos: string[] = [];
  const gravado: { tags?: string[]; ultimaCompra?: Record<string, unknown> } = {};
  const notas: string[] = [];
  const receitas: Array<Record<string, unknown>> = [];
  const deps: DepsDoPagamento = {
    lerContato: async () => (opts.semContato ? null : { id: "contato-1", tags: opts.tags ?? [] }),
    gravarCompra: async (_id, patch) => { passos.push("gravar"); gravado.tags = patch.tags; gravado.ultimaCompra = patch.ultimaCompra; },
    registrarReceita: async (_id, receita) => { passos.push("receita"); receitas.push(receita); },
    anotar: async (_id, texto) => { passos.push("anotar"); notas.push(texto); },
    negociosDoContato: async () => opts.negocios ?? [aberto],
    registrarValorNoNegocio: async () => { passos.push("valor"); },
    fecharComoGanho: async (leadId) => { passos.push(`fechar:${leadId}`); return opts.fecha ?? true; },
    pararFluxosVivos: async () => { passos.push("parar"); return 0; },
    acharFluxoDeEntrega: async () => { passos.push("achar-fluxo"); return opts.fluxo === undefined ? "fluxo-1" : opts.fluxo; },
    inscrever: async () => { passos.push("inscrever"); return opts.inscreve === false ? { ok: false, motivo: "ja_inscrito" } : { ok: true }; },
  };
  return { deps, passos, gravado, notas, receitas };
}

describe("registrarPagamentoRecebido", () => {
  it("⭐ marca como pago, grava o valor e SÓ ENTÃO fecha o negócio aberto", async () => {
    const d = dublês();
    const r = await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA });

    expect(r).toEqual({ resultado: "registrado", negocio: "fechado", entrega: "nao_pedida" });
    // O fechamento vem depois do valor: é o evento de fechamento que reporta a venda, e ele precisa do valor.
    expect(d.passos).toEqual(["gravar", "receita", "anotar", "valor", "fechar:neg-aberto", "parar"]);
    // O dinheiro vai para o ledger com a chave do registro: é dele que o Dashboard e a aba Receita somam.
    expect(d.receitas).toEqual([{ chave: CHAVE, valorCentavos: 13000, produto: "Abertura do Coração", metodo: "pix", pagoEm: AGORA.toISOString() }]);
    expect(d.gravado.tags).toEqual(expect.arrayContaining(["pago", "produto:abertura-do-coracao", `compra:manual-${CHAVE}`]));
    expect(d.gravado.ultimaCompra).toMatchObject({ valor_centavos: 13000, metodo: "pix", produto: "Abertura do Coração", pago_em: AGORA.toISOString() });
  });

  it("⭐ o mesmo registro enviado duas vezes não lança duas compras", async () => {
    const d = dublês({ tags: ["pago", `compra:manual-${CHAVE}`] });
    expect(await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA })).toEqual({ resultado: "ja_registrado" });
    expect(d.passos).toEqual([]);
  });

  it("negócio que já estava ganho não é fechado de novo — o valor soma e a venda é reenviada pela ponta do valor", async () => {
    const d = dublês({ negocios: [ganho] });
    const r = await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA });
    expect(r).toMatchObject({ resultado: "registrado", negocio: "ja_estava_ganho" });
    expect(d.passos).not.toContain("fechar:neg-ganho");
    expect(d.passos).toContain("valor");
  });

  it("contato sem negócio: o pagamento fica registrado e o desfecho diz que não havia o que fechar", async () => {
    const d = dublês({ negocios: [] });
    expect(await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA })).toMatchObject({ resultado: "registrado", negocio: "sem_negocio" });
    expect(d.passos).toEqual(["gravar", "receita", "anotar", "valor", "parar"]);
  });

  it("⭐ se o negócio não fechar, o pagamento continua registrado e a tela é avisada", async () => {
    const d = dublês({ fecha: false });
    const r = await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA });
    expect(r).toMatchObject({ resultado: "registrado", negocio: "nao_fechou" });
    expect(d.passos).toContain("gravar");
    expect(d.passos).toContain("parar");
  });

  it("a entrega automática só começa quando é pedida", async () => {
    const sem = dublês();
    await registrarPagamentoRecebido(sem.deps, { contatoId: "contato-1", pagamento: PAGAMENTO, agora: AGORA });
    expect(sem.passos).not.toContain("achar-fluxo");

    const com = dublês();
    const r = await registrarPagamentoRecebido(com.deps, { contatoId: "contato-1", pagamento: { ...PAGAMENTO, iniciar_entrega: true }, agora: AGORA });
    expect(r).toMatchObject({ entrega: "iniciada" });
    expect(com.passos.slice(-2)).toEqual(["achar-fluxo", "inscrever"]);
  });

  it("entrega pedida sem fluxo para o produto: registra e diz o motivo", async () => {
    const d = dublês({ fluxo: null });
    const r = await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: { ...PAGAMENTO, iniciar_entrega: true }, agora: AGORA });
    expect(r).toMatchObject({ resultado: "registrado", entrega: "sem_fluxo" });
  });

  it("a hora informada vale; a nota diz o que entrou e não leva nome de pessoa", async () => {
    const d = dublês();
    await registrarPagamentoRecebido(d.deps, { contatoId: "contato-1", pagamento: { ...PAGAMENTO, pago_em: "2026-10-11T15:28:32-03:00", metodo: "dinheiro" }, agora: AGORA });
    expect(d.gravado.ultimaCompra).toMatchObject({ pago_em: "2026-10-11T15:28:32-03:00", metodo: "dinheiro" });
    expect(d.notas[0]).toBe("Pagamento recebido fora do checkout: Abertura do Coração (R$ 130,00, Dinheiro). Registrado pela equipe.");
  });

  it("contato que não existe na organização: nada é gravado", async () => {
    const d = dublês({ semContato: true });
    expect(await registrarPagamentoRecebido(d.deps, { contatoId: "x", pagamento: PAGAMENTO, agora: AGORA })).toEqual({ resultado: "contato_nao_encontrado" });
    expect(d.passos).toEqual([]);
  });
});

describe("pagamentoRecebidoSchema", () => {
  it.each([
    ["valor zerado", { chave: CHAVE, valor_cents: 0, produto: "X" }],
    ["valor quebrado", { chave: CHAVE, valor_cents: 130.5, produto: "X" }],
    ["sem produto", { chave: CHAVE, valor_cents: 13000, produto: "  " }],
    ["sem chave", { valor_cents: 13000, produto: "X" }],
    ["método desconhecido", { chave: CHAVE, valor_cents: 13000, produto: "X", metodo: "cheque" }],
    ["campo a mais", { chave: CHAVE, valor_cents: 13000, produto: "X", organization_id: "outra" }],
  ])("recusa %s", (_caso, corpo) => {
    expect(pagamentoRecebidoSchema.safeParse(corpo).success).toBe(false);
  });

  it("o padrão é Pix, sem entrega automática", () => {
    expect(PAGAMENTO).toMatchObject({ metodo: "pix", iniciar_entrega: false });
  });
});

describe("sugestoesDePagamento", () => {
  const config = {
    pricing: {
      enabled: true,
      list_price_cents: 13000,
      steps: [{ price_cents: 10000, product_links: [{ name: "Abertura do Coração", url: "https://pay.exemplo.com/a" }, { name: "Limpeza e Proteção", url: "https://pay.exemplo.com/b" }] }],
      post_sale: { enabled: true, wait_hours: 0, price_cents: 4500, product_links: [{ name: "Sons Vocálicos", url: "https://pay.exemplo.com/c" }] },
    },
  };

  it("⭐ lista o que a organização vende, com o preço cheio da tabela e o valor próprio do pós-venda", () => {
    expect(sugestoesDePagamento([config])).toEqual([
      { produto: "Abertura do Coração", valor_cents: 13000 },
      { produto: "Limpeza e Proteção", valor_cents: 13000 },
      { produto: "Sons Vocálicos", valor_cents: 4500 },
    ]);
  });

  it("o mesmo produto em dois agentes aparece uma vez; configuração estranha não derruba a lista", () => {
    expect(sugestoesDePagamento([config, config, null, { pricing: "quebrado" }])).toHaveLength(3);
    expect(sugestoesDePagamento([])).toEqual([]);
  });
});
