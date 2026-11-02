import { describe, expect, it } from "vitest";

import { baloesPelaChave } from "@/lib/pagamentos/como-pagar-pix";

import { blocoDaEntradaImediata } from "./bloco-da-entrada";
import { blocoDaChavePix, chaveParaCopiar, chavePorExtenso, codigoDaChave, tipoDaChave } from "./chave-pix";
import { entradaImediata } from "./estado-da-negociacao";
import { falaErradaDoPagamento } from "./fala-do-pagamento";
import { pricingSchema } from "./tipos";

const CHAVE = { key: "+5569900000000", holder: "Fulano de Tal", primary: true };

describe("chave de celular sem o +55 (02/11/2026)", () => {
  it("⭐ o balão para copiar leva o celular sem o +55; o copia e cola continua com o +55 do padrão do Pix", () => {
    expect(chaveParaCopiar(CHAVE)).toBe("69900000000");
    expect(codigoDaChave(CHAVE, 4700, "conversa-1")).toContain("+5569900000000");
    expect(chavePorExtenso(CHAVE.key)).toBe("celular 69900000000");
    expect(tipoDaChave(CHAVE)).toBe("Celular");
    expect(tipoDaChave({ key: "12.345.678/0001-90" })).toBe("CNPJ");
    expect(tipoDaChave({ key: "pix@empresa.com" })).toBe("E-mail");
    expect(chaveParaCopiar({ ...CHAVE, key: "pix@empresa.com" })).toBe("pix@empresa.com");
  });

  it("⭐ o passo a passo diz o tipo da chave quando o banco pergunta", () => {
    const [instrucao, chave] = baloesPelaChave("R$ 47,00 (Entrada)", "69900000000", "Fulano de Tal", "Celular");
    expect(instrucao).toContain("escolha *Pagar com chave* (em alguns bancos, *Transferir*). Se o banco perguntar o tipo de chave, escolha *Celular*.");
    expect(instrucao).toContain("coloque o valor *R$ 47,00* e confirme");
    expect(chave).toBe("69900000000");
    expect(baloesPelaChave("R$ 7", "x@y.com", "F")[0]).not.toContain("tipo de chave");
  });

  it("⭐ o bloco do turno diz que o número é a chave e proíbe fingir que mandou", () => {
    const bloco = blocoDaChavePix(CHAVE, [4700]);
    expect(bloco).toContain("um número de CELULAR (69900000000), sem o +55");
    expect(bloco).toContain('"esse número é a chave?", a resposta é SIM');
    expect(bloco).toContain("NÃO tem campo de valor");
    expect(bloco).toContain('É PROIBIDO dizer "a chave vai aqui embaixo"');
  });
});

describe("a fala do pagamento — o que a Ana ouviu em 02/11/2026", () => {
  const semChave = [{ direction: "outbound", body: "Fechado, Ana: você entra com R$ 50 agora." }];
  const comChave = [...semChave, { direction: "outbound", body: "69900000000" }];

  it("⭐ dizer que a chave está aqui ou já foi, sem chave nenhuma, é recusado", () => {
    for (const fala of [
      "Ana, a chave do Pix para os R$ 47 vai aqui embaixo, sozinha, num balão limpo.",
      "Aqui está a chave novamente, Ana, sozinha na mensagem pra você achar fácil.",
      "Isso, Ana. A chave do Pix já está aí em cima, sozinha na mensagem.",
      "Te mandei a chave do Pix aqui: é só copiar e colar no app do seu banco.",
    ]) {
      expect(falaErradaDoPagamento(fala, semChave), fala).toContain("ainda não mandou chave nenhuma");
    }
  });

  it("com a chave já na conversa, com a cobrança neste envio, ou numa pergunta, passa", () => {
    expect(falaErradaDoPagamento("A chave do Pix já está aí em cima, sozinha na mensagem.", comChave)).toBeNull();
    expect(falaErradaDoPagamento("A chave vai aqui embaixo.\n\n[[PIX: Entrada]]", semChave)).toBeNull();
    expect(falaErradaDoPagamento("Posso te mandar a chave do Pix pra você entrar na firmeza de hoje?", semChave)).toBeNull();
  });

  it("⭐ negar a chave, inventar o tipo dela e mandar digitar valor no link são recusados", () => {
    expect(falaErradaDoPagamento("Não, Ana. Esse número não é a chave do Pix. Foi um erro meu.", comChave)).toContain("É a chave do Pix");
    expect(falaErradaDoPagamento("A chave é o CNPJ do nosso financeiro.", comChave)).toContain("tipo");
    expect(falaErradaDoPagamento("Abre o link aqui embaixo e coloca o valor de R$ 47.", comChave)).toContain("valor fixo");
    expect(falaErradaDoPagamento("Na página do link, depois de escolher o cartão, tem o campo do valor.", comChave)).toContain("valor fixo");
    expect(falaErradaDoPagamento("No cartão dá para dividir em até 12 vezes.", comChave)).toBeNull();
  });
});

describe("a entrada já combinada continua valendo", () => {
  const PRICING = pricingSchema.parse({
    enabled: true,
    list_price_cents: 13000,
    min_down_payment_cents: 1000,
    steps: [10000, 6000].map((v) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] })),
  });
  const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });
  const ANA = [
    m("outbound", "Aqui o seu trabalho completo é *R$ 130*, uma vez só."),
    m("inbound", "no momento to sem condições"),
    m("outbound", "Você não precisa pagar tudo hoje. Quanto você consegue colocar hoje?"),
    m("inbound", "50"),
    m("outbound", "Fechado, Ana: você entra com R$ 50 agora, e o restante de R$ 80 a gente acerta depois."),
    m("inbound", "VC vai fazer uma abertura do coração eu nunca ouvi falar desse ritual antes"),
  ];

  it("⭐ o caso da Ana: ela perguntou outra coisa depois de fechar 50, e a entrada de R$ 50 segue liberada", () => {
    expect(entradaImediata(PRICING, ANA)).toEqual({ entradaCents: 5000, restanteCents: 8000, combinadaAntes: true });
    expect(entradaImediata(PRICING, [...ANA, m("outbound", "É um trabalho de linha branca."), m("inbound", "não vi a chave")])).toEqual({
      entradaCents: 5000,
      restanteCents: 8000,
      combinadaAntes: true,
    });
  });

  it("depois de pago, sem a agente ter aceito, ou sem entrada mínima configurada, não vale", () => {
    const pago = [...ANA, m("outbound", "Recebi aqui o seu comprovante, Ana. O pagamento caiu."), m("inbound", "obrigada")];
    expect(entradaImediata(PRICING, pago)).toBeNull();
    const naoAceito = [...ANA.slice(0, 4), m("outbound", "Me conta mais do que você sente."), m("inbound", "tá bom")];
    expect(entradaImediata(PRICING, naoAceito)).toBeNull();
    const { min_down_payment_cents: _semMinimo, ...semMinimo } = PRICING;
    expect(entradaImediata(semMinimo, ANA)).toBeNull();
  });

  it("o bloco da entrada combinada não repete o fechamento e manda a marca quando ela pedir a chave", () => {
    const bloco = blocoDaEntradaImediata({ entradaCents: 5000, restanteCents: 8000, combinadaAntes: true });
    expect(bloco).toContain("ENTRADA JÁ COMBINADA");
    expect(bloco).toContain("[[PIX: Entrada]]");
    expect(bloco).toContain("O link do cartão NÃO serve para a entrada");
    expect(bloco).not.toContain('"Fechado, [nome]');
  });
});
