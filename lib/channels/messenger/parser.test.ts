import { describe, expect, it } from "vitest";

import { extrairAtribuicaoMeta } from "@/lib/channels/atribuicao-de-anuncio-oficial";

import { eventosDoAviso, externalIdDoMessenger, referralDoAnuncio } from "./parser";

const PAGINA = "111222333";
const PESSOA = "999888777";
const NOSSO_APP = "1431224221868157";

const aviso = (...messaging: unknown[]) => ({ object: "page", entry: [{ id: PAGINA, time: 1, messaging }] });

describe("eventosDoAviso", () => {
  it("mensagem de texto da pessoa vira entrada, endereçada pela pessoa (PSID)", () => {
    const [e] = eventosDoAviso(
      aviso({ sender: { id: PESSOA }, recipient: { id: PAGINA }, timestamp: 1_700_000_000_000, message: { mid: "m_1", text: "oi" } }),
      NOSSO_APP,
    );
    expect(e?.tipo).toBe("mensagem");
    if (e?.tipo !== "mensagem") return;
    expect(e.mensagem.direction).toBe("inbound");
    expect(e.mensagem.text).toBe("oi");
    expect(e.mensagem.conversationId).toBe(PESSOA);
    expect(e.mensagem.participantId).toBe(PESSOA);
    expect(e.mensagem.accountId).toBe(PAGINA);
    expect(e.mensagem.platform).toBe("facebook");
    expect(e.mensagem.externalId).toBe(externalIdDoMessenger(PAGINA, "m_1"));
    expect(e.mensagem.sentAt).toBe(new Date(1_700_000_000_000).toISOString());
  });

  it("eco do NOSSO app é descartado (senão a IA se pausaria a cada mensagem que ela mesma manda)", () => {
    const eventos = eventosDoAviso(
      aviso({ sender: { id: PAGINA }, recipient: { id: PESSOA }, message: { mid: "m_2", text: "legenda", is_echo: true, app_id: Number(NOSSO_APP) } }),
      NOSSO_APP,
    );
    expect(eventos).toEqual([]);
  });

  it("eco de OUTRA origem (resposta pela caixa da Meta) entra como saída para a mesma pessoa", () => {
    const [e] = eventosDoAviso(
      aviso({ sender: { id: PAGINA }, recipient: { id: PESSOA }, message: { mid: "m_3", text: "respondi à mão", is_echo: true, app_id: 263902037430900 } }),
      NOSSO_APP,
    );
    expect(e?.tipo === "mensagem" && e.mensagem.direction).toBe("outbound");
    expect(e?.tipo === "mensagem" && e.mensagem.conversationId).toBe(PESSOA);
  });

  it("mensagem endereçada a outra página no mesmo corpo não é atribuída a esta", () => {
    expect(eventosDoAviso(aviso({ sender: { id: PESSOA }, recipient: { id: "outra" }, message: { mid: "m_4", text: "x" } }), NOSSO_APP)).toEqual([]);
  });

  it("anexos: imagem, arquivo como documento, figurinha como figurinha; URL não-https é recusada", () => {
    const [e] = eventosDoAviso(
      aviso({
        sender: { id: PESSOA },
        recipient: { id: PAGINA },
        message: {
          mid: "m_5",
          attachments: [
            { type: "image", payload: { url: "https://cdn.fbsbx.com/a.jpg" } },
            { type: "file", payload: { url: "https://cdn.fbsbx.com/a.pdf" } },
            { type: "image", payload: { url: "https://cdn.fbsbx.com/s.png", sticker_id: 369239263222822 } },
            { type: "image", payload: { url: "http://inseguro/x.jpg" } },
          ],
        },
      }),
      NOSSO_APP,
    );
    expect(e?.tipo === "mensagem" && e.mensagem.attachments).toEqual([
      { type: "image", url: "https://cdn.fbsbx.com/a.jpg" },
      { type: "document", url: "https://cdn.fbsbx.com/a.pdf" },
      { type: "sticker", url: "https://cdn.fbsbx.com/s.png" },
    ]);
  });

  it("toque em botão vira o TÍTULO do botão, não o payload", () => {
    const [e] = eventosDoAviso(
      aviso({ sender: { id: PESSOA }, recipient: { id: PAGINA }, timestamp: 5, postback: { mid: "m_6", title: "Quero saber mais", payload: "BTN_42" } }),
      NOSSO_APP,
    );
    expect(e?.tipo === "mensagem" && e.mensagem.text).toBe("Quero saber mais");
  });

  it("entrega por mids e leitura por marca d'água", () => {
    const eventos = eventosDoAviso(
      aviso(
        { sender: { id: PESSOA }, recipient: { id: PAGINA }, delivery: { mids: ["m_7", "m_8"], watermark: 10 } },
        { sender: { id: PESSOA }, recipient: { id: PAGINA }, read: { watermark: 1_700_000_000_000 } },
      ),
      NOSSO_APP,
    );
    expect(eventos).toEqual([
      { tipo: "entregue", pageId: PAGINA, externalIds: [externalIdDoMessenger(PAGINA, "m_7"), externalIdDoMessenger(PAGINA, "m_8")] },
      { tipo: "lida", pageId: PAGINA, psid: PESSOA, ate: new Date(1_700_000_000_000).toISOString() },
    ]);
  });

  it("corpo que não é de página, mensagem apagada e mensagem vazia não viram nada", () => {
    expect(eventosDoAviso({ object: "instagram", entry: [] }, NOSSO_APP)).toEqual([]);
    expect(eventosDoAviso(aviso({ sender: { id: PESSOA }, recipient: { id: PAGINA }, message: { mid: "m_9", is_deleted: true } }), NOSSO_APP)).toEqual([]);
    expect(eventosDoAviso(aviso({ sender: { id: PESSOA }, recipient: { id: PAGINA }, message: { mid: "m_10" } }), NOSSO_APP)).toEqual([]);
  });
});

describe("referralDoAnuncio", () => {
  it("clique em anúncio vira a forma que a atribuição da Meta já lê", () => {
    const r = referralDoAnuncio({ source: "ADS", type: "OPEN_THREAD", ad_id: "6012345", ref: "x", ads_context_data: { ad_title: "Promoção" } });
    const atribuicao = extrairAtribuicaoMeta(r);
    expect(atribuicao?.plataforma).toBe("meta_ads");
    expect(atribuicao?.adId).toBe("6012345");
    expect(atribuicao?.titulo).toBe("Promoção");
  });

  it("link m.me ou QR da página não é anúncio pago", () => {
    expect(referralDoAnuncio({ source: "SHORTLINK", ref: "promo" })).toBeNull();
    expect(referralDoAnuncio(undefined)).toBeNull();
  });

  it("o referral do anúncio viaja junto com a primeira mensagem", () => {
    const [e] = eventosDoAviso(
      aviso({ sender: { id: PESSOA }, recipient: { id: PAGINA }, message: { mid: "m_11", text: "vim do anúncio", referral: { source: "ADS", ad_id: "77" } } }),
      NOSSO_APP,
    );
    expect(e?.tipo === "mensagem" && extrairAtribuicaoMeta(e.mensagem.referral)?.adId).toBe("77");
  });
});
