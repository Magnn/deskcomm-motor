/**
 * Ela pediu cartão: vai só o link. As falas são do caso de 21/11/2026, parafraseadas.
 */
import { describe, expect, it, vi } from "vitest";

import { cobrancaPeloProvedorNoLugarDoLink } from "@/lib/agent-engine/agent/cobranca-pelo-provedor-no-envio";
import { pixDoExtraNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-do-extra-no-envio";

import { blocoDePreco, LINHA_DO_CARTAO } from "./bloco-do-prompt";
import { reclamacoesDeValor } from "./estado-da-negociacao";
import { falaPedeCartao, pediuCartao } from "./pediu-cartao";
import { pricingSchema, type Extra } from "./tipos";

const ent = (body: string) => ({ direction: "inbound" as const, body });
const sai = (body: string) => ({ direction: "outbound" as const, body });
const COBRANCA = "Assim que fizer, me manda o comprovante aqui. Se preferir pagar no cartão, é por este link: https://buy.stripe.com/x";

describe("quem pede cartão", () => {
  it("⭐ as falas do caso pedem cartão; sem crédito no cartão, não", () => {
    for (const f of ["Precisa ser pelo link", "Não tenho como pagar no pix.", "Não consigo fazer no Pix, não tenho saldo na conta", "Posso pagar no cartão?", "dá pra parcelar?"]) {
      expect(falaPedeCartao(f), f).toBe(true);
    }
    for (const f of ["Estou sem limite no cartão, não dá agora", "não tenho cartão", "o cartão está bloqueado", "Eu acredito que ela vai embora", "vou fazer o pix agora"]) {
      expect(falaPedeCartao(f), f).toBe(false);
    }
  });

  it("vale para a cobrança logo depois do pedido e para a seguinte, não para sempre", () => {
    const conversa = [sai(COBRANCA), ent("Precisa ser pelo link"), sai(COBRANCA), ent("não tenho saldo na conta")];
    expect(pediuCartao(conversa)).toBe(true);
    expect(pediuCartao([...conversa, sai(COBRANCA), ent("e sobre a outra pessoa?")])).toBe(false);
    expect(pediuCartao([sai(COBRANCA), ent("vou ver aqui")])).toBe(false);
  });

  it("⭐ 'não tenho como fazer no Pix, sem dinheiro na conta' não conta como reclamação do valor", () => {
    const preco = sai("O trabalho fica R$ 130, uma vez só.");
    expect(reclamacoesDeValor([preco, ent("Não tenho como pagar no pix. Não tenho dinheiro na conta.")])).toBe(0);
    expect(reclamacoesDeValor([preco, ent("Não tenho dinheiro agora.")])).toBe(1);
  });

  it("o bloco do turno avisa o modelo, menos quando falta para o essencial", () => {
    const c = pricingSchema.parse({ enabled: true, list_price_cents: 13000, steps: [{ price_cents: 10000, product_links: [{ name: "Trabalho", url: "https://pay.exemplo.com.br/t100" }] }] });
    expect(blocoDePreco(c, { reclamacoes: 0, pediuCartao: true })).toContain(LINHA_DO_CARTAO);
    expect(blocoDePreco(c, { reclamacoes: 0 })).not.toContain(LINHA_DO_CARTAO);
    expect(blocoDePreco(c, { reclamacoes: 0, pediuCartao: true, faltaParaOEssencial: true })).not.toContain(LINHA_DO_CARTAO);
  });
});

describe("a cobrança de quem pediu cartão sai só como link", () => {
  const LINK_DA_CONFIG = "https://pay.exemplo.com.br/t130";
  const pricing = pricingSchema.parse({
    enabled: true,
    list_price_cents: 13000,
    list_product_links: [{ name: "Trabalho", url: LINK_DA_CONFIG }],
    steps: [],
    pix_key: { key: "+5511999990000", holder: "Empresa Exemplo", primary: true },
  });
  const base = {
    pricing,
    organizationId: "org",
    contactId: "contato",
    conversationId: "11111111-2222-3333-4444-555555555555",
    supabase: {} as never,
    log: { info: vi.fn(), warn: vi.fn() },
    lerConexao: async () => ({ chave: "sk_x" }) as never,
    pagamentosAntes: 0,
    agora: new Date("2026-11-21T12:00:00Z"),
  };
  const criarLink = vi.fn(async () => ({ id: "plink_1", url: "https://buy.provedor.com/cartao" }));

  it("⭐ produto principal: sem a chave, só o link de cartão do valor", async () => {
    const corpo = `O valor é R$ 130.\n\n${LINK_DA_CONFIG}`;
    const so = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarLink, soCartao: true });
    if (!("corpo" in so)) throw new Error("esperava corpo");
    expect(so.corpo).toContain("O pagamento de *R$ 130* é por este link, no cartão de crédito: https://buy.provedor.com/cartao");
    expect(so.corpo).not.toContain("11999990000");
    expect(so.corpo).not.toContain("Pix");

    const comChave = await cobrancaPeloProvedorNoLugarDoLink({ ...base, corpo, criarLink });
    expect("corpo" in comChave && comChave.corpo).toContain("11999990000");
  });

  it("cobrança avulsa: só o link de cartão; se o link não sai, a chave vai", async () => {
    const extras = [{ name: "Pergunta nova", when: "x", price_cents: 2700 }] as unknown as Extra[];
    const comum = { ...base, corpo: "Abro a mesa pra essa pergunta.\n\n[[PIX: Pergunta nova]]", extras, chavePrincipal: pricing.pix_key, soCartao: true };
    const so = await pixDoExtraNoLugarDaMarca({ ...comum, criarLink });
    expect("corpo" in so && so.corpo).toContain("https://buy.provedor.com/cartao");
    expect("corpo" in so && so.corpo).not.toContain("11999990000");

    const semLink = await pixDoExtraNoLugarDaMarca({ ...comum, criarLink: async () => { throw new Error("fora"); } });
    expect("corpo" in semLink && semLink.corpo).toContain("11999990000");
  });
});
