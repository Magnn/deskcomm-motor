/**
 * O corpo do envio à Meta nos dois destinos: mensageria (número oficial) e PIXEL DO SITE (número por QR).
 * Medido em 20/10/2026: com o número oficial banido, toda venda do número novo era pulada; agora ela vai ao pixel
 * do site como `chat`, identificada pelo telefone.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { transporteMeta } from "./conversions";

const BASE = {
  organizationId: "org",
  leadId: "lead-1",
  evento: "Purchase" as const,
  eventoId: "lead-1:Purchase",
  ocorridoEm: new Date(),
  cliqueDeOrigem: "clique-1",
  telefone: "5569999990000",
  moeda: "BRL",
  valorCentavos: 13000,
};
const CRED = { datasetId: "965", accessToken: "tok", testEventCode: null };

function corpoEnviado(fetchMock: ReturnType<typeof vi.fn>): { data: Array<Record<string, unknown>> } {
  const init = (fetchMock.mock.calls as unknown as unknown[][])[0]![1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("transporteMeta", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("número oficial: business_messaging, com o clique e a conta do WhatsApp", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await transporteMeta.enviar(CRED, { ...BASE, contaDoWhatsApp: "waba" });
    const ev = corpoEnviado(f).data[0]!;
    expect(ev.action_source).toBe("business_messaging");
    expect(ev.messaging_channel).toBe("whatsapp");
    expect(ev.user_data).toMatchObject({ ctwa_clid: "clique-1", whatsapp_business_account_id: "waba" });
  });

  it("⭐ pixel do site: `chat`, sem clique nem conta do WhatsApp, telefone e país em hash, com o valor", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await transporteMeta.enviar(CRED, { ...BASE, pixelDoSite: true });
    expect(r.tipo).toBe("ok");
    expect(String((f.mock.calls as unknown as unknown[][])[0]![0])).toContain("/965/events");
    const ev = corpoEnviado(f).data[0]!;
    expect(ev.action_source).toBe("chat");
    expect(ev).not.toHaveProperty("messaging_channel");
    const ud = ev.user_data as Record<string, unknown>;
    expect(ud).not.toHaveProperty("ctwa_clid");
    expect(ud).not.toHaveProperty("whatsapp_business_account_id");
    expect((ud.ph as string[])[0]).toMatch(/^[0-9a-f]{64}$/);
    expect((ud.country as string[])[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(ev.custom_data).toEqual({ value: 130, currency: "BRL" });
  });

  it("⭐ o Lead da página pelo servidor: website, com a página, IP, navegador, fbc e o mesmo id do navegador", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await transporteMeta.enviar(CRED, {
      ...BASE,
      evento: "Lead",
      eventoId: "eid-1234-abcd",
      telefone: null,
      valorCentavos: null,
      pixelDoSite: true,
      paginaDoSite: "https://acassia.tech/presel/",
      fbc: "fb.1.1760000000000.IwAR0abc",
      cliente: { ip: "200.1.2.3", ua: "Mozilla/5.0" },
    });
    const ev = corpoEnviado(f).data[0]!;
    expect(ev).toMatchObject({ event_name: "Lead", event_id: "eid-1234-abcd", action_source: "website", event_source_url: "https://acassia.tech/presel/" });
    expect(ev).not.toHaveProperty("custom_data");
    expect(ev.user_data).toMatchObject({ client_ip_address: "200.1.2.3", client_user_agent: "Mozilla/5.0", fbc: "fb.1.1760000000000.IwAR0abc" });
  });

  it("⭐ pixel do site com o clique da landing: fbc e fbp vão em claro, ligando a venda ao anúncio", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", f);
    await transporteMeta.enviar(CRED, { ...BASE, pixelDoSite: true, fbc: "fb.1.1760000000000.IwAR0abc", fbp: "fb.1.1760000000000.123456789" });
    const ud = corpoEnviado(f).data[0]!.user_data as Record<string, unknown>;
    expect(ud.fbc).toBe("fb.1.1760000000000.IwAR0abc");
    expect(ud.fbp).toBe("fb.1.1760000000000.123456789");
  });
});
