import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateMetadata } from "@/app/c/[org]/layout";

describe("ícone da aba na área do cliente", () => {
  it("o layout declara favicon E ícone da Apple, com o desenho da empresa", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ org: "cigana-esmeralda" }) });
    const icons = meta.icons as { icon: Array<{ url: string; type: string }>; apple: string };
    expect(icons.icon[0]).toMatchObject({ url: "/c/cigana-esmeralda/icone?t=192", type: "image/png" });
    expect(icons.apple).toBe("/c/cigana-esmeralda/icone?t=192");
  });

  it("a página não redeclara `icons` (declarar só `apple` apagava o favicon herdado)", () => {
    const pagina = readFileSync("app/c/[org]/page.tsx", "utf8");
    expect(pagina).not.toMatch(/\bicons\s*:/);
  });
});
