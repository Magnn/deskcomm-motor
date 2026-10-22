import { describe, expect, it } from "vitest";

import { caminhoDaMidiaSchema, urlDaMidiaDaArea } from "./midia";

const ORG = "b6113ac6-a884-4fab-a595-d5f05cebc729";

describe("mídia da área", () => {
  it("aceita o caminho da organização e recusa o que escapa dela", () => {
    expect(caminhoDaMidiaSchema.safeParse(`${ORG}/guia/foto.jpg`).success).toBe(true);
    expect(caminhoDaMidiaSchema.safeParse(`${ORG}/sinastria/video-meio.mp4`).success).toBe(true);
    expect(caminhoDaMidiaSchema.safeParse(`${ORG}/../outra/foto.jpg`).success).toBe(false);
    expect(caminhoDaMidiaSchema.safeParse(`/${ORG}/foto.jpg`).success).toBe(false);
    expect(caminhoDaMidiaSchema.safeParse(`${ORG}/script.js`).success).toBe(false);
    expect(caminhoDaMidiaSchema.safeParse("https://exemplo.com/foto.jpg").success).toBe(false);
  });

  it("a URL sai do caminho e da base; sem um dos dois, nada", () => {
    expect(urlDaMidiaDaArea(`${ORG}/guia/foto.jpg`, "https://api.exemplo.com/")).toBe(
      `https://api.exemplo.com/storage/v1/object/public/area-midia/${ORG}/guia/foto.jpg`,
    );
    expect(urlDaMidiaDaArea(null, "https://api.exemplo.com")).toBeNull();
    expect(urlDaMidiaDaArea(`${ORG}/guia/foto.jpg`, "")).toBeNull();
  });
});
