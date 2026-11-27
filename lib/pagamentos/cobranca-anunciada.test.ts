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

const pediu = (body: string) => ({ direction: "inbound", body });
const falas = (n: number) => Array.from({ length: n }, (_, i) => saiu(`fala ${i}`));

describe("chave dada como ENVIADA sem ter saído (medido em 27/11/2026)", () => {
  // A chave tinha saído na VÉSPERA, para outra cobrança. A pessoa pediu o Pix; a agente respondeu que a chave "chegou aí" /
  // "já foi aí", e a pessoa não achou: "achei não, manda aí".
  const chaveDeOntem = [saiu("69993677810"), ...falas(12)];

  it("'a chave é o número que chegou aí' volta ao modelo quando nenhuma chave saiu nas últimas falas", () => {
    expect(anunciaCobrancaSemCobranca("A chave é o número que chegou aí, de *Matheus*. Se o banco perguntar o tipo, é *Celular*.", chaveDeOntem)).toBe(true);
    expect(anunciaCobrancaSemCobranca("O Pix que te mandei é no nome do Matheus.", [saiu("Perfeito, então é no Pix.")])).toBe(true);
  });

  it("'conseguiu achar a chave aí?' também precisa de uma chave recente", () => {
    expect(anunciaCobrancaSemCobranca("Conseguiu achar a chave aí?", chaveDeOntem)).toBe(true);
  });

  it("com a chave nas últimas falas (ou neste turno), falar dela passa", () => {
    const recente = [...falas(3), saiu("69993677810"), saiu("Assim que fizer, me manda o comprovante.")];
    expect(anunciaCobrancaSemCobranca("A chave do Pix é o número que já foi aí pra você, de *Matheus*.", recente)).toBe(false);
    expect(anunciaCobrancaSemCobranca("Conseguiu achar a chave aí?", recente)).toBe(false);
  });
});

describe("pediu a chave: a resposta que fala da chave tem que trazer a chave (medido em 27/11/2026)", () => {
  const base = [saiu("69993677810"), ...falas(12)];

  it("'manda a chave de novo' respondido com 'é o número que já foi aí' volta ao modelo", () => {
    const h = [...base, pediu("Manda a chave de novo")];
    expect(anunciaCobrancaSemCobranca("Claro, meu bem. A chave do Pix é no nome do *Matheus*, que cuida do financeiro do Templo.", h)).toBe(true);
  });

  it("'achei não' / 'manda aí' depois de falar da chave também conta como pedido", () => {
    const h = [...base, saiu("A chave do Pix é no nome do Matheus."), pediu("?"), pediu("Achei nao"), pediu("Manda ai")];
    expect(anunciaCobrancaSemCobranca("Calma, meu bem, a chave do Pix é a mesma de antes.", h)).toBe(true);
  });

  it("balão que não fala da chave passa (a chave vem no balão seguinte)", () => {
    const h = [...base, pediu("Manda a chave de novo")];
    expect(anunciaCobrancaSemCobranca("Claro, meu bem.", h)).toBe(false);
  });

  it("o pedido continua valendo depois de um balão do turno sem a chave", () => {
    const h = [...base, pediu("Manda a chave de novo"), saiu("Claro, meu bem.")];
    expect(anunciaCobrancaSemCobranca("A chave do Pix é o número que já foi aí pra você.", h)).toBe(true);
  });

  it("balão com a marca passa, e depois que a chave saiu no turno falar dela também passa", () => {
    const h = [...base, pediu("Manda a chave de novo")];
    expect(anunciaCobrancaSemCobranca("[[PIX: Pergunta nova]]", h)).toBe(false);
    expect(anunciaCobrancaSemCobranca("A chave do Pix é essa aí de cima, meu bem.", [...h, saiu("69993677810")])).toBe(false);
  });

  it("falar de Pix sem a pessoa ter pedido a chave não é pedido", () => {
    const h = [...base, pediu("Quanto custa a pergunta?")];
    expect(anunciaCobrancaSemCobranca("A pergunta nova é R$ 27. Prefere no Pix ou no cartão?", h)).toBe(false);
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
