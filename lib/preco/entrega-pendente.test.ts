/**
 * A entrega que ainda não começou — o caso do Adilson (19/10/2026): o Pix da pergunta caiu às 15:13, no mesmo
 * minuto em que ele mandou a foto do comprovante, e a agente seguiu cobrando um Pix já pago.
 */
import { describe, expect, it } from "vitest";

import { blocoDaEntregaPendente, entregaPendente } from "./extras";
import type { Extra } from "./tipos";

const EXTRAS = [
  { name: "Pergunta nova", when: "x", price_cents: 500 },
  { name: "Acompanhamento do mês", when: "x", price_cents: 6000, valid_days: 30 },
] as unknown as Extra[];
const AGORA = new Date("2026-10-19T20:13:30Z");
const em = (iso: string, direction: "inbound" | "outbound") => ({ direction, sent_at: iso });

describe("entrega pendente de cobrança avulsa", () => {
  it("⭐ pagou agora, a última fala é dela (o comprovante): este turno é a entrega", () => {
    const mensagens = [em("2026-10-19T20:08:00Z", "outbound"), em("2026-10-19T20:13:05Z", "inbound")];
    const p = entregaPendente(EXTRAS, [{ slug: "pergunta-nova", hora: "15:13", minutosAtras: 0 }], mensagens, AGORA);
    expect(p?.extra.name).toBe("Pergunta nova");
    const bloco = blocoDaEntregaPendente(p);
    expect(bloco).toContain("Esta resposta É A ENTREGA");
    expect(bloco).toContain("não peça comprovante");
  });

  it("a agente já falou depois do pagamento: a entrega já começou, nada a forçar", () => {
    const mensagens = [em("2026-10-19T20:13:05Z", "inbound"), em("2026-10-19T20:13:25Z", "outbound")];
    expect(entregaPendente(EXTRAS, [{ slug: "pergunta-nova", hora: "15:13", minutosAtras: 0 }], mensagens, AGORA)).toBeNull();
  });

  it("pagamento antigo, ou de período (acompanhamento), não é entrega pendente", () => {
    expect(entregaPendente(EXTRAS, [{ slug: "pergunta-nova", hora: "14:00", minutosAtras: 73 }], [], AGORA)).toBeNull();
    expect(entregaPendente(EXTRAS, [{ slug: "acompanhamento-do-mes", hora: "15:13", minutosAtras: 0 }], [], AGORA)).toBeNull();
  });

  it("⭐ entregue pela equipe (vela com vídeo — 11/11/2026): confirma o que vai ser feito, nunca que já foi", () => {
    const vela = { name: "Vela no Seu Nome", when: "x", price_cents: 2700, team_delivers: true } as unknown as Extra;
    const bloco = blocoDaEntregaPendente({ extra: vela, minutos: 0 });
    expect(bloco).toContain("QUEM FAZ É A EQUIPE");
    expect(bloco).toContain("Nunca diga que já foi feito");
    expect(bloco).not.toContain("comece a entrega agora");
  });

  it("sem pendência, sem bloco", () => {
    expect(blocoDaEntregaPendente(null)).toBe("");
  });
});
