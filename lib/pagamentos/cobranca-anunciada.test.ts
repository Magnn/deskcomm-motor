import { describe, expect, it } from "vitest";

import { anunciaCobrancaSemCobranca, trazCobranca } from "./cobranca-anunciada";

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

describe("trazCobranca (toque de silêncio não cobra)", () => {
  it("marca, chave ou link contam como cobrança; pergunta não", () => {
    expect(trazCobranca("O seu trabalho ficou em R$ 100.\n\n[[PIX: Entrada]]")).toBe(true);
    expect(trazCobranca("Se preferir, é por este link: https://buy.stripe.com/abc")).toBe(true);
    expect(trazCobranca("Gracielle, quer que eu te mande o Pix da Oração dos Sonhos?")).toBe(false);
  });
});

describe("link que não é de pagamento não desarma a trava (releitura de 22/11/2026)", () => {
  it("o link da política não conta como cobrança", () => {
    expect(anunciaCobrancaSemCobranca("Vou te mandar a chave agora. Veja nossa politica: https://example.com/privacidade")).toBe(true);
    expect(trazCobranca("Dá uma olhada aqui: https://meumisterio.com/blog/tarot")).toBe(false);
  });
  it("links de pagamento reais seguem contando", () => {
    for (const url of ["https://pay.cakto.com.br/6pabzsk_1132655", "https://buy.stripe.com/fZucN75F8gNy0L86AB3433n", "https://checkout.stripe.com/c/pay/x", "https://pagar.acassia.tech/x"]) {
      expect(trazCobranca(`O link do cartão: ${url}`)).toBe(true);
    }
  });
  it("a chave sozinha numa linha e o copia-e-cola contam; um número no meio da frase não", () => {
    expect(trazCobranca("69912345678")).toBe(true);
    expect(trazCobranca("A chave é esta:\n69912345678\nMe manda o comprovante?")).toBe(true);
    expect(trazCobranca("00020126580014br.gov.bcb.pix")).toBe(true);
    expect(trazCobranca("Meu telefone 69912345678 é o mesmo do zap")).toBe(false);
  });
});
