import { describe, expect, it } from "vitest";

import { escolherWhatsappDaArea } from "./whatsapp-vivo";

describe("WhatsApp do botão da área", () => {
  it("⭐ número configurado caído: vai para um dos números vivos (16/11/2026)", () => {
    expect(escolherWhatsappDaArea("5569900000001", false, ["5569900000002", "5569900000003"], () => 0.9)).toBe("5569900000003");
  });

  it("configurado vivo fica, e sem nenhum vivo também fica o configurado", () => {
    expect(escolherWhatsappDaArea("5569900000001", true, ["5569900000002"])).toBe("5569900000001");
    expect(escolherWhatsappDaArea("5569900000001", false, [])).toBe("5569900000001");
    expect(escolherWhatsappDaArea(undefined, false, ["5569900000002"])).toBeUndefined();
  });
});
