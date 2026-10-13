import { describe, expect, it, vi } from "vitest";

import { expandirCobrancas, itensDaCobranca, marcaDeCobrancaNoTexto } from "./cobranca-no-conteudo";

const COBRANCA = { copiaECola: "00020101021226740014br.gov.bcb.pix", qrCodeUrl: "https://qr.exemplo.com/a.png", urlDoCartao: "https://buy.exemplo.com/x" };

describe("cobrança por pessoa no conteúdo do fluxo", () => {
  it("lê a marca com valor inteiro, com centavos e com o nome do produto", () => {
    expect(marcaDeCobrancaNoTexto("Segue: [[COBRAR: 60]]")).toMatchObject({ valorCentavos: 6000, produto: null });
    expect(marcaDeCobrancaNoTexto("[[cobrar: 97,50 | Limpeza Espiritual]]")).toMatchObject({ valorCentavos: 9750, produto: "Limpeza Espiritual" });
    expect(marcaDeCobrancaNoTexto("sem marca, só R$ 60")).toBeNull();
    expect(marcaDeCobrancaNoTexto("[[COBRAR: 0]]")).toBeNull();
  });

  it("⭐ a marca vira instrução, código sozinho, QR code e link de cartão; o texto em volta é preservado", () => {
    const texto = "Estou colocando aqui os meios de pagamento.\n\n[[COBRAR: 60]]\n\nAssim que pagar, me avisa.";
    const itens = itensDaCobranca(texto, marcaDeCobrancaNoTexto(texto)!, COBRANCA);
    expect(itens.map((i) => i.type)).toEqual(["text", "text", "text", "image", "text", "text"]);
    expect(itens[0]).toEqual({ type: "text", body: "Estou colocando aqui os meios de pagamento." });
    expect((itens[1] as { body: string }).body).toContain("Valor: *R$ 60*");
    expect(itens[2]).toEqual({ type: "text", body: COBRANCA.copiaECola });
    expect(itens[3]).toMatchObject({ type: "image", url: COBRANCA.qrCodeUrl });
    expect((itens[4] as { body: string }).body).toContain(COBRANCA.urlDoCartao);
    expect(itens[5]).toEqual({ type: "text", body: "Assim que pagar, me avisa." });
    // A marca crua não sobra em lugar nenhum.
    expect(JSON.stringify(itens)).not.toContain("[[");
  });

  it("só cartão, só Pix sem QR, e nenhum dos dois", () => {
    const marca = marcaDeCobrancaNoTexto("[[COBRAR: 100]]")!;
    expect(itensDaCobranca("[[COBRAR: 100]]", marca, { copiaECola: null, qrCodeUrl: null, urlDoCartao: "https://buy.exemplo.com/x" })).toHaveLength(1);
    expect(itensDaCobranca("[[COBRAR: 100]]", marca, { copiaECola: "000201x", qrCodeUrl: null, urlDoCartao: null }).map((i) => i.type)).toEqual(["text", "text"]);
    expect(() => itensDaCobranca("[[COBRAR: 100]]", marca, { copiaECola: null, qrCodeUrl: null, urlDoCartao: null })).toThrow(/cobranca_indisponivel/);
  });

  it("⭐ só o texto com a marca é trocado; os outros itens passam intactos e cada marca cria a sua cobrança", async () => {
    const criar = vi.fn(async (_p: { valorCentavos: number; produto: string | null; ordem: number }) => COBRANCA);
    const itens = [
      { type: "delay", seconds: 20 },
      { type: "text", body: "Oi" },
      { type: "text", body: "[[COBRAR: 130 | Trabalho]]" },
      { type: "audio", storage_path: "a.ogg", mime: "audio/ogg" },
    ];
    const saida = await expandirCobrancas(itens, criar);
    expect(saida.slice(0, 2)).toEqual(itens.slice(0, 2));
    expect(saida.at(-1)).toEqual(itens[3]);
    expect(saida).toHaveLength(2 + 4 + 1);
    expect(criar).toHaveBeenCalledTimes(1);
    expect(criar.mock.calls[0]![0]).toEqual({ valorCentavos: 13000, produto: "Trabalho", ordem: 1 });
  });

  it("se o provedor falha, a expansão lança: a caixa não sai com a marca crua", async () => {
    await expect(expandirCobrancas([{ type: "text", body: "[[COBRAR: 60]]" }], async () => { throw new Error("cobranca_sem_conexao"); })).rejects.toThrow("cobranca_sem_conexao");
  });
});
