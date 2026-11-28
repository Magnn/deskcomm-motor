import { beforeEach, describe, expect, it } from "vitest";

import { enviarConversaoPelaZernio, esquecerConjuntosGarantidos } from "./conversoes";

const chave = { accountId: "acc1", apiKey: "k", baseUrl: "https://z.test/api" };
const venda = {
  evento: "Purchase",
  eventoId: "lead1:Purchase",
  ocorridoEm: new Date("2026-11-21T12:00:00Z"),
  telefone: "+55 69 99999-0000",
  valorCentavos: 6000,
  moeda: "brl",
};

function fetchFalso(respostas: Record<string, { status: number; corpo: unknown }>) {
  const chamadas: Array<{ url: string; corpo: Record<string, unknown> }> = [];
  const impl = (async (url: string, init: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init.body)) });
    const caminho = Object.keys(respostas).find((c) => url.endsWith(c))!;
    const r = respostas[caminho]!;
    return new Response(JSON.stringify(r.corpo), { status: r.status });
  }) as unknown as typeof fetch;
  return { impl, chamadas };
}

describe("conversão pela Zernio", () => {
  beforeEach(() => esquecerConjuntosGarantidos());

  it("garante o conjunto uma vez e manda a compra com valor em reais e telefone só dígitos", async () => {
    const f = fetchFalso({
      "/v1/whatsapp/dataset": { status: 200, corpo: { datasetId: "d1", created: false } },
      "/v1/whatsapp/conversions": { status: 200, corpo: { eventsReceived: 1, eventsFailed: 0, failures: [], traceId: "t" } },
    });
    expect((await enviarConversaoPelaZernio(chave, venda, f.impl)).tipo).toBe("ok");
    expect((await enviarConversaoPelaZernio(chave, venda, f.impl)).tipo).toBe("ok");
    expect(f.chamadas.filter((c) => c.url.endsWith("/dataset"))).toHaveLength(1);
    const envio = f.chamadas.find((c) => c.url.endsWith("/conversions"))!.corpo;
    expect(envio).toMatchObject({ accountId: "acc1", eventName: "Purchase", eventId: "lead1:Purchase", phoneE164: "5569999990000", value: 60, currency: "BRL", eventTime: 1795262400 });
  });

  it("com a conversa do intermediário, busca por ela e não pelo telefone (o 9 do número salvo não casa)", async () => {
    const f = fetchFalso({
      "/v1/whatsapp/dataset": { status: 200, corpo: { datasetId: "d1" } },
      "/v1/whatsapp/conversions": { status: 200, corpo: { eventsReceived: 1, eventsFailed: 0 } },
    });
    expect((await enviarConversaoPelaZernio(chave, { ...venda, conversaId: "6b09fc01" }, f.impl)).tipo).toBe("ok");
    const envio = f.chamadas.find((c) => c.url.endsWith("/conversions"))!.corpo;
    expect(envio.conversationId).toBe("6b09fc01");
    expect(envio).not.toHaveProperty("phoneE164");
  });

  it("200 com eventsFailed é recusa, não sucesso", async () => {
    const f = fetchFalso({
      "/v1/whatsapp/dataset": { status: 200, corpo: { datasetId: "d1" } },
      "/v1/whatsapp/conversions": { status: 200, corpo: { eventsReceived: 0, eventsFailed: 1, failures: [{ message: "bad" }] } },
    });
    const r = await enviarConversaoPelaZernio(chave, venda, f.impl);
    expect(r).toEqual({ tipo: "permanente", detalhe: "Meta recusou: bad" });
  });

  it("422 sem clique é permanente; 5xx é transitório", async () => {
    const sem = fetchFalso({
      "/v1/whatsapp/dataset": { status: 200, corpo: { datasetId: "d1" } },
      "/v1/whatsapp/conversions": { status: 422, corpo: { error: "no ctwa_clid" } },
    });
    expect((await enviarConversaoPelaZernio(chave, venda, sem.impl)).tipo).toBe("permanente");
    esquecerConjuntosGarantidos();
    const fora = fetchFalso({ "/v1/whatsapp/dataset": { status: 503, corpo: {} } });
    expect((await enviarConversaoPelaZernio(chave, venda, fora.impl)).tipo).toBe("transitorio");
  });

  it("evento que a mensageria não aceita nem sai", async () => {
    const f = fetchFalso({});
    expect((await enviarConversaoPelaZernio(chave, { ...venda, evento: "Lead" }, f.impl)).tipo).toBe("permanente");
    expect(f.chamadas).toHaveLength(0);
  });
});
