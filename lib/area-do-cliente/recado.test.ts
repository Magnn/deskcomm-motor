/**
 * O RECADO DA ABA HOJE nunca é cobrança.
 *
 * Medido em 18/10/2026: a "última mensagem" da área de um contato era a régua de retomada de 11/10 ("você
 * quer continuar com esse acerto ou prefere que eu pare de te procurar?"), a primeira coisa lida ao entrar.
 * A régua sai como fala da própria agente, então o texto decide, não só a origem.
 */
import { describe, expect, it } from "vitest";

import { recadoDaEmpresa, type FalaDaConversa } from "./dados";

let n = 0;
const fala = (de: FalaDaConversa["de"], texto: string, extra: Partial<FalaDaConversa> = {}): FalaDaConversa => ({
  id: `f${++n}`,
  de,
  texto,
  quando: `2026-10-1${n % 9}T12:00:00.000Z`,
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
    expect(recadoDaEmpresa(falas)?.id).toBe(cuidado.id);
  });

  it("pula disparo de campanha, áudio, fala da pessoa e frase curta demais", () => {
    const falas = [
      cuidado,
      fala("empresa", "Bom dia! Aqui é a Cigana Esmeralda, meu WhatsApp mudou de número.", { automatica: true }),
      fala("empresa", "🎤 um recado de voz longo o bastante para passar do mínimo"),
      fala("voce", "Obrigada por tudo, estou me sentindo bem melhor hoje."),
      fala("empresa", "Que bom!"),
    ];
    expect(recadoDaEmpresa(falas)?.id).toBe(cuidado.id);
  });

  it("valor em reais e link também são cobrança", () => {
    expect(recadoDaEmpresa([fala("empresa", "Hoje está saindo por R$ 60, posso te mandar?")])).toBeNull();
    expect(recadoDaEmpresa([fala("empresa", "Te mandei o link aqui embaixo, é só tocar e concluir.")])).toBeNull();
  });

  it("palavra que só CONTÉM um termo não é cobrança (apagar não é pagar)", () => {
    const f = fala("empresa", "Pode apagar a vela com cuidado quando terminar a oração da noite.");
    expect(recadoDaEmpresa([f])?.id).toBe(f.id);
  });

  it("sem recado de cuidado, não mostra nada", () => {
    expect(recadoDaEmpresa([])).toBeNull();
  });
});
