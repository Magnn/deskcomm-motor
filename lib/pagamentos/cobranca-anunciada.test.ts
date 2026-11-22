import { describe, expect, it } from "vitest";

import { anunciaCobrancaSemCobranca } from "./cobranca-anunciada";

const saiu = (body: string) => ({ direction: "outbound", body });

describe("anunciaCobrancaSemCobranca", () => {
  it("o caso medido: anuncia a chave e o link e não traz nenhum", () => {
    expect(anunciaCobrancaSemCobranca("Fechado: você entra com R$ 30 agora.\n\nA chave do Pix de R$ 30 e o link do cartão no mesmo valor vão aqui:")).toBe(true);
    expect(anunciaCobrancaSemCobranca("Me desculpa a demora. Vou te mandar a chave agora.")).toBe(true);
    expect(anunciaCobrancaSemCobranca("Já te mando o Pix, meu bem.")).toBe(true);
  });

  it("com a marca ou o link no corpo, o anúncio passa", () => {
    expect(anunciaCobrancaSemCobranca("A chave do Pix vai aqui:\n\n[[PIX: Entrada]]\n\nConsegue fazer agora?")).toBe(false);
    expect(anunciaCobrancaSemCobranca("O link segue abaixo:\n\nhttps://pay.cakto.com.br/abc\n\nPrefere no cartão?")).toBe(false);
  });

  it("'conseguiu copiar a chave?' só passa se alguma chave já saiu", () => {
    expect(anunciaCobrancaSemCobranca("Conseguiu copiar a chave pra fazer o Pix de R$ 30?", [saiu("Fechado, R$ 30.")])).toBe(true);
    expect(anunciaCobrancaSemCobranca("Conseguiu copiar a chave pra fazer o Pix de R$ 30?", [saiu("69993677810")])).toBe(false);
  });

  it("explicar como funciona o Pix, sem anunciar envio, passa", () => {
    expect(anunciaCobrancaSemCobranca("A chave é no nome do Matheus, que cuida do financeiro do Templo. Quer pagar no Pix ou no cartão?")).toBe(false);
    expect(anunciaCobrancaSemCobranca("Pix ou cartão, como fica melhor pra você?")).toBe(false);
  });
});
