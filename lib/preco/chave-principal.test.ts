import { describe, expect, it, vi } from "vitest";

import { cobrancaPeloProvedorNoLugarDoLink } from "@/lib/agent-engine/agent/cobranca-pelo-provedor-no-envio";
import { pixDaEntradaNoLugarDaMarca, pixDoRestanteNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-da-entrada-no-envio";
import { pixDoExtraNoLugarDaMarca } from "@/lib/agent-engine/agent/pix-do-extra-no-envio";
import { itensDaCobranca } from "@/lib/followup/cobranca-no-conteudo";
import { chavePixNormalizada } from "@/lib/pagamentos/pix-estatico";
import { mensagensDoPix } from "@/lib/pagamentos/enviar-pix-tipos";
import { blocoDoPixQueNaoColou } from "@/lib/pagamentos/pix-que-nao-colou";

import { blocoDaChavePix, chavePrincipal, codigoDaChave, pixPelaChaveNoLugarDaMarca } from "./chave-pix";
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

  it("a venda sai pela chave, sem provedor e sem cartão", async () => {
    const pricing = {
      enabled: true,
      list_price_cents: 6000,
      steps: [],
      pix_key: CHAVE,
      list_product_links: [{ name: "Abertura", url: "https://pay.exemplo.com/abc" }],
    } as unknown as PricingConfig;
    const saida = await cobrancaPeloProvedorNoLugarDoLink({ ...base, pricing, corpo: "Segue:\n\nhttps://pay.exemplo.com/abc" });
    expect("corpo" in saida).toBe(true);
    if (!("corpo" in saida)) return;
    expect(saida.corpo).toContain("Fulano de Tal");
    expect(saida.corpo).toMatch(/(^|\n)000201/);
    expect(saida.corpo).toContain("comprovante");
    expect(saida.corpo).not.toContain("pay.exemplo.com");
    expect(saida.corpo).not.toContain("cartão");
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
      expect(saida.corpo).toMatch(/(^|\n)000201/);
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

  it("código da chave que não colou: reenvia pela marca e não fala em vencer", () => {
    const mensagens = [
      { direction: "outbound", body: codigoDaChave(CHAVE, 6000, CONVERSA)!, sent_at: "2026-11-01T12:00:00Z" },
      { direction: "inbound", body: "não colou", sent_at: "2026-11-01T12:05:00Z" },
    ] as never;
    const bloco = blocoDoPixQueNaoColou(mensagens, new Date("2026-11-01T12:06:00Z"), { pelaChave: true });
    expect(bloco).toContain("[[CHAVE PIX");
    expect(bloco).not.toContain("vence em 1 hora");
  });

  it("botão do atendente e fluxo levam o nome e o pedido de comprovante", () => {
    expect(mensagensDoPix(6000, "000201abc", "Fulano de Tal").join(" ")).toContain("comprovante");
    expect(mensagensDoPix(6000, "000201abc")).toHaveLength(2);
    const itens = itensDaCobranca("[[COBRAR: 60]]", { valorCentavos: 6000, produto: null, bruto: "[[COBRAR: 60]]" }, {
      copiaECola: "000201abc",
      qrCodeUrl: null,
      urlDoCartao: null,
      titularDaChave: "Fulano de Tal",
    });
    const texto = itens.map((i) => (i.type === "text" ? i.body : "")).join(" ");
    expect(texto).toContain("Fulano de Tal");
    expect(texto).toContain("comprovante");
  });
});
