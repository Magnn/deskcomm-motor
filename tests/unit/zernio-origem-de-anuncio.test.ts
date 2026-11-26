import { describe, expect, it, vi } from "vitest";

/**
 * A origem de anúncio num número do intermediário. Medido em 26/11/2026: o provider guarda o clique
 * na CONVERSA (`metadata.ctwa_*`), não na mensagem — e a ingestão procurava só na mensagem. Sete de
 * oito conversas de anúncio de um dia entraram como WhatsApp comum, e as vendas delas não chegavam
 * à Meta.
 */
vi.mock("@/lib/channels/zernio/credentials", () => ({
  resolveZernioCreds: vi.fn(async () => ({ accountId: "acc", apiKey: "k", baseUrl: "https://z", source: "session" })),
}));

import { extrairAtribuicaoMeta } from "@/lib/channels/atribuicao-de-anuncio-oficial";
import { completarAtribuicaoDaConversa } from "@/lib/channels/zernio/atribuicao";
import { parseZernioInbound, referralDaConversa, type ZernioInboundMessage } from "@/lib/channels/zernio/webhook";

const METADATA = {
  ctwa_clid: "Afh-clique",
  ctwa_source_id: "120252534274060639",
  ctwa_source_url: "https://fb.me/x",
  ctwa_source_type: "ad",
  ctwa_headline: "Ainda pensa em você?",
  ctwa_media_type: "video",
};

describe("referralDaConversa", () => {
  it("traduz metadata.ctwa_* para o referral que a atribuição lê", () => {
    const a = extrairAtribuicaoMeta(referralDaConversa({ metadata: METADATA }));
    expect(a).toMatchObject({ plataforma: "meta_ads", sourceId: "Afh-clique", adId: "120252534274060639", titulo: "Ainda pensa em você?" });
  });
  it("conversa sem clique não vira anúncio", () => {
    expect(referralDaConversa({ metadata: {} })).toBeNull();
    expect(referralDaConversa(null)).toBeNull();
  });
});

describe("parse do webhook", () => {
  it("lê a origem quando o evento traz a conversa com o metadata", () => {
    const m = parseZernioInbound({
      event: "message.received",
      account: { id: "acc" },
      conversation: { id: "c1", metadata: METADATA },
      message: { id: "m1", platform: "whatsapp", conversationId: "c1", platformMessageId: "wamid.1", direction: "incoming", text: "Quero minha primeira leitura grátis", attachments: [], sender: { phoneNumber: "+5544999990000" } },
    });
    expect(extrairAtribuicaoMeta(m?.referral)?.adId).toBe("120252534274060639");
  });
});

describe("completarAtribuicaoDaConversa — conversa nova sem origem no evento", () => {
  const base = { kind: "message", direction: "inbound", accountId: "acc", conversationId: "c1", externalId: "w1", referral: null } as unknown as ZernioInboundMessage;
  const admin = {} as never;

  it("busca a conversa na API e devolve a mensagem com a origem", async () => {
    const buscar = vi.fn(async (_url: string) => new Response(JSON.stringify({ data: { id: "c1", metadata: METADATA } }), { status: 200 }));
    const r = await completarAtribuicaoDaConversa(admin, "org", base, buscar as unknown as typeof fetch);
    expect(String(buscar.mock.calls[0]?.[0])).toBe("https://z/v1/inbox/conversations/c1?accountId=acc");
    expect(extrairAtribuicaoMeta(r.referral)?.sourceId).toBe("Afh-clique");
  });
  it("não chama a API quando o evento já trouxe a origem, nem para mensagem de saída", async () => {
    const buscar = vi.fn();
    await completarAtribuicaoDaConversa(admin, "org", { ...base, referral: { ctwa_clid: "x" } }, buscar as unknown as typeof fetch);
    await completarAtribuicaoDaConversa(admin, "org", { ...base, direction: "outbound" } as ZernioInboundMessage, buscar as unknown as typeof fetch);
    expect(buscar).not.toHaveBeenCalled();
  });
  it("falha da API não derruba a mensagem", async () => {
    const buscar = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await completarAtribuicaoDaConversa(admin, "org", base, buscar as unknown as typeof fetch)).toBe(base);
  });
});
