import { describe, expect, it, vi } from "vitest";

import { cobrancaPeloProvedorNoLugarDoLink } from "@/lib/agent-engine/agent/cobranca-pelo-provedor-no-envio";
import { pixDaEntradaNoLugarDaMarca, pixDoRestanteNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-da-entrada-no-envio";
import { pixDoExtraNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-do-extra-no-envio";
import { itensDaCobranca } from "@/lib/followup/cobranca-no-conteudo";
import { chavePixNormalizada } from "@/lib/pagamentos/pix-estatico";
import { mensagensDoPixPelaChave } from "@/lib/pagamentos/enviar-pix-tipos";
import { blocoDoPixQueNaoColou } from "@/lib/pagamentos/pix-que-nao-colou";

import { blocoDaChavePix, chaveParaCopiar, chavePrincipal, codigoDaChave, pixPelaChaveNoLugarDaMarca } from "./chave-pix";
import { pricingSchema, type PricingConfig } from "./tipos";

const CHAVE = { key: "+5569900000000", holder: "Fulano de Tal", primary: true };
const CONVERSA = "11111111-2222-3333-4444-555555555555";
const log = { info: vi.fn(), warn: vi.fn() };
const naoChama = () => {
  throw new Error("o provedor não pode ser consultado");
};
const base = {
  organizationId: "org",
  contactId: "contato",
  conversationId: CONVERSA,
  supabase: {} as never,
  log,
  lerConexao: naoChama as never,
  criarPix: naoChama as never,
  criarLink: naoChama as never,
};

describe("chave Pix como forma principal", () => {
  it("só vale com primary ligado, e a configuração guarda a opção", () => {
    expect(chavePrincipal({ pix_key: { key: "x@y.co", holder: "Ana" } })).toBeNull();
    expect(chavePrincipal({ pix_key: CHAVE })).toEqual(CHAVE);
    expect(chavePrincipal(null)).toBeNull();
    const salvo = pricingSchema.safeParse({ enabled: true, list_price_cents: 6000, steps: [], pix_key: CHAVE });
    expect(salvo.success).toBe(true);
    if (salvo.success) expect(salvo.data.pix_key?.primary).toBe(true);
  });

  it("telefone precisa do +55: 10 dígitos e 11 sem o + não viram chave de telefone", () => {
    expect(chavePixNormalizada("+5569900000000")).toBe("+5569900000000");
    expect(chavePixNormalizada("6900000000")).toBeNull();
    const codigo = codigoDaChave(CHAVE, 6000, CONVERSA)!;
    expect(codigo.startsWith("000201")).toBe(true);
    expect(codigo).toContain("+5569900000000");
    expect(codigo).toContain("540560.00");
    expect(codigo).toContain("FULANO DE TAL");
  });

  const pricingComLink = () => ({
      enabled: true,
      list_price_cents: 6000,
      steps: [],
      pix_key: CHAVE,
      list_product_links: [{ name: "Abertura", url: "https://pay.exemplo.com/abc" }],
  }) as unknown as PricingConfig;

  it("o Pix sai pela chave e o cartão por um link só de cartão do provedor", async () => {
    const criarLink = vi.fn(async () => ({ id: "plink", url: "https://buy.exemplo.com/cartao" }));
    const saida = await cobrancaPeloProvedorNoLugarDoLink({
      ...base,
      lerConexao: (async () => ({ id: "c" })) as never,
      criarLink: criarLink as never,
      supabase: { from: () => { throw new Error("sem histórico"); } } as never,
      pricing: pricingComLink(),
      corpo: "Segue:\n\nhttps://pay.exemplo.com/abc",
    });
    expect("corpo" in saida).toBe(true);
    if (!("corpo" in saida)) return;
    expect(saida.corpo).not.toContain("000201");
    // O balão da chave vai sem o +55 (02/11/2026): é como os bancos pedem a chave de celular.
    expect(saida.corpo).toContain("\n\n69900000000\n\n");
    expect(saida.corpo).toContain("escolha *Celular*");
    expect(saida.corpo).toContain("https://buy.exemplo.com/cartao");
    expect(saida.corpo).not.toContain("pay.exemplo.com");
    expect(criarLink).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ soCartao: true, valorCentavos: 6000 }));
  });

  it("sem o link do provedor, o cartão vai pelo link cadastrado (Cakto) e o Pix continua pela chave", async () => {
    const saida = await cobrancaPeloProvedorNoLugarDoLink({ ...base, pricing: pricingComLink(), corpo: "Segue:\n\nhttps://pay.exemplo.com/abc" });
    expect("corpo" in saida).toBe(true);
    if (!("corpo" in saida)) return;
    expect(saida.corpo).toContain("Fulano de Tal");
    expect(saida.corpo).toContain("Pagar com chave");
    expect(saida.corpo).toContain("comprovante");
    expect(saida.corpo).toContain("cartão, é por este link: https://pay.exemplo.com/abc");
    expect(saida.corpo.indexOf("+5569900000000")).toBeLessThan(saida.corpo.indexOf("https://pay.exemplo.com/abc"));
  });

  it("entrada, restante e avulsa saem pela chave", async () => {
    const entrada = await pixDaEntradaNoLugarDaMarca({
      ...base,
      chavePrincipal: CHAVE,
      corpo: "[[PIX: Entrada]]",
      entrada: { entradaCents: 3000, restanteCents: 3000 },
      produto: "Abertura",
    });
    const restante = await pixDoRestanteNoLugarDaMarca({ ...base, chavePrincipal: CHAVE, corpo: "[[PIX: Restante]]", restanteCents: 3000, produto: "Abertura" });
    const extra = await pixDoExtraNoLugarDaMarca({
      ...base,
      chavePrincipal: CHAVE,
      corpo: "[[PIX: Pergunta nova]]",
      extras: [{ name: "Pergunta nova", price_cents: 500, when: "" }] as never,
    });
    for (const saida of [entrada, restante, extra]) {
      expect("corpo" in saida).toBe(true);
      if (!("corpo" in saida)) continue;
      expect(saida.corpo).not.toContain("000201");
      expect(saida.corpo).toContain("\n\n69900000000\n\n");
      expect(saida.corpo).not.toContain("+5569900000000");
      expect(saida.corpo).toContain("Fulano de Tal");
      expect(saida.corpo).toContain("comprovante");
      expect(saida.corpo).not.toContain("empresa de pagamentos");
      expect(saida.corpo).not.toContain("[[");
    }
  });

  it("a marca da chave não espera outra forma de pagamento quando ela é a principal", () => {
    const comPrincipal = pixPelaChaveNoLugarDaMarca({
      corpo: "[[CHAVE PIX: 60]]",
      chave: CHAVE,
      valoresPermitidosCents: [6000],
      identificador: "abc",
      outraFormaJaTentada: false,
    });
    expect("corpo" in comPrincipal).toBe(true);
    if ("corpo" in comPrincipal) {
      expect(comPrincipal.corpo).toMatch(/(^|\n)000201/);
      expect(comPrincipal.corpo).toContain("Copia e Cola");
    }
    const comoReserva = pixPelaChaveNoLugarDaMarca({
      corpo: "[[CHAVE PIX: 60]]",
      chave: { key: CHAVE.key, holder: CHAVE.holder },
      valoresPermitidosCents: [6000],
      identificador: "abc",
      outraFormaJaTentada: false,
    });
    expect("recusa" in comoReserva).toBe(true);
  });

  it("o bloco do turno troca de último recurso para principal", () => {
    const bloco = blocoDaChavePix(CHAVE, [6000]);
    expect(bloco).toContain("PRINCIPAL");
    expect(bloco).not.toContain("ÚLTIMO RECURSO");
    expect(bloco).toContain("comprovante");
    expect(blocoDaChavePix({ key: CHAVE.key, holder: CHAVE.holder }, [6000])).toContain("ÚLTIMO RECURSO");
  });

  it("chave que não funcionou: manda o copia e cola pela marca e não fala em vencer", () => {
    const mensagens = [
      { direction: "outbound", body: chaveParaCopiar(CHAVE), sent_at: "2026-11-01T12:00:00Z" },
      { direction: "inbound", body: "a chave não foi", sent_at: "2026-11-01T12:05:00Z" },
    ] as never;
    expect(blocoDoPixQueNaoColou(mensagens, new Date("2026-11-01T12:06:00Z"))).toBe("");
    const bloco = blocoDoPixQueNaoColou(mensagens, new Date("2026-11-01T12:06:00Z"), { chaveDaEmpresa: chaveParaCopiar(CHAVE) });
    expect(bloco).toContain("[[CHAVE PIX");
    expect(bloco).not.toContain("vence em 1 hora");
  });

  it("botão do atendente e fluxo levam o nome e o pedido de comprovante", () => {
    expect(mensagensDoPixPelaChave(6000, "+5569900000000", "Fulano de Tal")[1]).toBe("+5569900000000");
    const itens = itensDaCobranca("[[COBRAR: 60]]", { valorCentavos: 6000, produto: null, bruto: "[[COBRAR: 60]]" }, {
      copiaECola: null,
      qrCodeUrl: null,
      urlDoCartao: null,
      pelaChave: { chave: "+5569900000000", titular: "Fulano de Tal" },
    });
    const texto = itens.map((i) => (i.type === "text" ? i.body : "")).join(" ");
    expect(texto).toContain("Fulano de Tal");
    expect(texto).toContain("comprovante");
  });
});
