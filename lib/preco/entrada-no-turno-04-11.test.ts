import { describe, expect, it } from "vitest";

import { perguntaAntesDoPixDaEntrada } from "./bloco-da-entrada";
import { entradaImediata } from "./estado-da-negociacao";
import { pricingSchema } from "./tipos";

// A escada da Cigana em 04/11/2026: R$ 130 de venda, degraus 100/60/50, entrada mínima de R$ 10.
const link = (v: number) => ({ price_cents: v, product_links: [{ name: "Abertura do Coração", url: `https://pay.exemplo.com.br/v${v}` }] });
const PRICING = pricingSchema.parse({ enabled: true, list_price_cents: 13000, min_down_payment_cents: 1000, steps: [link(10000), link(6000), link(5000)] });
const m = (direction: "inbound" | "outbound", body: string) => ({ direction, body });
const PRECO = m("outbound", "Aqui o seu trabalho completo é *R$ 130*, uma vez só, sem mensalidade.");

describe("entrada no valor dito — 04/11/2026", () => {
  it("⭐ Edna: ouviu R$ 100, disse 'dou 50' — o restante é R$ 50, não R$ 80", () => {
    const conversa = [PRECO, m("inbound", "Tudo fica quanto"), m("outbound", "Edna, é *R$ 100* o seu trabalho, uma vez só."), m("inbound", "Dou 50 amanhã outro"), m("inbound", "No mês que vem")];
    expect(entradaImediata(PRICING, conversa)).toEqual({ entradaCents: 5000, restanteCents: 5000 });
  });

  it("sem degrau dito, o total continua sendo o valor de venda", () => {
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "Só tenho 50$ aqui no Pix"), m("inbound", "Dinheiro só dia 10")])).toEqual({ entradaCents: 5000, restanteCents: 8000 });
  });

  it("quem tem o valor inteiro do degrau dito não é entrada", () => {
    expect(entradaImediata(PRICING, [PRECO, m("outbound", "Consegui deixar por *R$ 60*."), m("inbound", "tenho 60")])).toBeNull();
  });

  it("⭐ Ademir: 'Vc faz em 2 X?' no Pix é metade agora", () => {
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "Vc faz em 2 X?")])).toEqual({ entradaCents: 6500, restanteCents: 6500 });
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "posso pagar metade hoje?")])).toEqual({ entradaCents: 6500, restanteCents: 6500 });
    // Cartão é parcelamento, não entrada; 12x não é 2x.
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "dá em 2x no cartão?")])).toBeNull();
    expect(entradaImediata(PRICING, [PRECO, m("inbound", "faz em 12x?")])).toBeNull();
  });
});

describe("perguntaAntesDoPixDaEntrada", () => {
  const ENTRADA = { entradaCents: 5000, restanteCents: 8000 };

  it("⭐ França: com a entrada no turno, 'Quanto você consegue hoje?' é recusado e a recusa manda a marca", () => {
    const recusa = perguntaAntesDoPixDaEntrada("Entendo, França. Você não precisa pagar tudo hoje. Quanto você consegue hoje?", ENTRADA, []);
    expect(recusa).toContain("[[PIX: Entrada]]");
    expect(recusa).toContain("R$ 50");
    expect(perguntaAntesDoPixDaEntrada("Me diz só o dia do restante, que eu te mando o Pix. Qual dia fica bom?", ENTRADA, [])).not.toBeNull();
  });

  it("o balão de fechamento passa, e a pergunta depois do Pix também", () => {
    expect(perguntaAntesDoPixDaEntrada("Fechado, França: você entra com R$ 50 agora e o restante de R$ 80 a gente acerta depois.", ENTRADA, [])).toBeNull();
    expect(perguntaAntesDoPixDaEntrada("Conseguiu fazer o Pix? E me diz que dia fica bom pra acertar o restante.", ENTRADA, ["Pra pagar no Pix (*R$ 50 (Entrada)*): …", "69993677810"])).toBeNull();
    expect(perguntaAntesDoPixDaEntrada("Pra pagar no Pix (*R$ 50 (Entrada)*): 1. Toque… Conseguiu?", ENTRADA, [])).toBeNull();
  });

  it("sem entrada, ou com a entrada combinada antes, não recusa nada", () => {
    expect(perguntaAntesDoPixDaEntrada("Quanto você consegue hoje?", null, [])).toBeNull();
    expect(perguntaAntesDoPixDaEntrada("É linha branca, sim. Quer a chave de novo?", { ...ENTRADA, combinadaAntes: true }, [])).toBeNull();
  });
});
