/**
 * O RECADO DA ABA HOJE nunca é cobrança.
 *
 * Medido em 18/10/2026: a "última mensagem" da área de um contato era a régua de retomada de 11/10 ("você
 * quer continuar com esse acerto ou prefere que eu pare de te procurar?"), a primeira coisa lida ao entrar.
 * Na 1ª versão do filtro, o que sobrou foi "Se sim, me manda o comprovante pra eu localizar certinho? Às
 * vezes demora um pouquinho pra cair no sistema!" — cobrança com outras palavras, e bolha solta no meio do
 * raciocínio. A régua sai como fala da própria agente, então o texto decide, não só a origem.
 */
import { describe, expect, it } from "vitest";

import { recadoDaEmpresa, type FalaDaConversa } from "./dados";

const AGORA = new Date("2026-10-18T20:00:00.000Z");
let n = 0;
const fala = (de: FalaDaConversa["de"], texto: string, extra: Partial<FalaDaConversa> = {}): FalaDaConversa => ({
  id: `f${++n}`,
  de,
  texto,
  quando: "2026-10-17T12:00:00.000Z",
  ...extra,
});

describe("recadoDaEmpresa", () => {
  const cuidado = fala("empresa", "A vela que você acendeu hoje já foi a sua entrega. Respire e confie no processo.");

  it("pula a cobrança mais recente e mostra o último recado de cuidado", () => {
    const falas = [
      cuidado,
      fala("empresa", "Oi, meu bem! Fico pensando se o PIX acabou travando aí no seu lado."),
      fala("empresa", "Me diz com sinceridade: você quer continuar com esse acerto ou prefere que eu pare de te procurar?"),
    ];
    expect(recadoDaEmpresa(falas, AGORA)?.id).toBe(cuidado.id);
  });

  it("cobrança com outras palavras e bolha solta no meio do raciocínio ficam de fora", () => {
    const falas = [
      cuidado,
      fala("empresa", "Se sim, me manda o comprovante pra eu localizar certinho? Às vezes demora um pouquinho pra cair no sistema!"),
      fala("empresa", "E aí, conseguiu ver com calma o que conversamos ontem à noite?"),
      fala("empresa", "Consegui uma condição especial com desconto só até amanhã para você."),
      fala("empresa", "isso ajuda a ter resultado mais rapido, confia em mim nessa parte"),
    ];
    expect(recadoDaEmpresa(falas, AGORA)?.id).toBe(cuidado.id);
  });

  it("pula disparo de campanha, áudio, fala da pessoa e frase curta demais", () => {
    const falas = [
      cuidado,
      fala("empresa", "Bom dia! Aqui é a Cigana Esmeralda, meu WhatsApp mudou de número.", { automatica: true }),
      fala("empresa", "🎤 um recado de voz longo o bastante para passar do mínimo"),
      fala("voce", "Obrigada por tudo, estou me sentindo bem melhor hoje."),
      fala("empresa", "Que bom!"),
    ];
    expect(recadoDaEmpresa(falas, AGORA)?.id).toBe(cuidado.id);
  });

  it("valor em reais e link também são cobrança", () => {
    expect(recadoDaEmpresa([fala("empresa", "Hoje está saindo por R$ 60, posso te mandar?")], AGORA)).toBeNull();
    expect(recadoDaEmpresa([fala("empresa", "Te mandei o link aqui embaixo, é só tocar e concluir.")], AGORA)).toBeNull();
  });

  it("palavra que só CONTÉM um termo não é cobrança (apagar não é pagar)", () => {
    const f = fala("empresa", "Pode apagar a vela com cuidado quando terminar a oração da noite.");
    expect(recadoDaEmpresa([f], AGORA)?.id).toBe(f.id);
  });

  it("recado de mais de 14 dias atrás não aparece", () => {
    const velho = fala("empresa", "A vela que você acendeu já foi a sua entrega. Confie no processo.", {
      quando: "2026-09-30T12:00:00.000Z",
    });
    expect(recadoDaEmpresa([velho], AGORA)).toBeNull();
  });

  it("sem recado de cuidado, não mostra nada", () => {
    expect(recadoDaEmpresa([], AGORA)).toBeNull();
  });
});
