import { describe, expect, it } from "vitest";

import { resumoDosCanais } from "./resumo";

describe("resumoDosCanais", () => {
  it("junta os jeitos de ligar WhatsApp num canal só e separa quem precisa de atenção", () => {
    const r = resumoDosCanais([
      { provider: "waha", status: "WORKING" },
      { provider: "meta_cloud", status: "WORKING" },
      { provider: "zernio", status: "SCAN_QR_CODE" },
    ]);
    expect(r.whatsapp).toEqual({ total: 3, funcionando: 2, precisaDeAtencao: 1 });
    expect(r.messenger.total).toBe(0);
  });

  it("a página do Facebook e o Instagram ligado a ela são canais diferentes", () => {
    const r = resumoDosCanais([
      { provider: "meta_messenger", status: "WORKING", social_platform: null },
      { provider: "meta_messenger", status: "WORKING", social_platform: "instagram" },
      { provider: "zernio_social", status: "FAILED", social_platform: "instagram" },
      { provider: "telegram_bot", status: "WORKING" },
    ]);
    expect(r.messenger).toEqual({ total: 1, funcionando: 1, precisaDeAtencao: 0 });
    expect(r.instagram).toEqual({ total: 2, funcionando: 1, precisaDeAtencao: 1 });
    expect(r.telegram.funcionando).toBe(1);
  });

  it("provider que esta imagem não conhece não vira número de WhatsApp", () => {
    const r = resumoDosCanais([{ provider: "novo_provider", status: "WORKING" }]);
    expect(Object.values(r).every((c) => c.total === 0)).toBe(true);
  });
});
