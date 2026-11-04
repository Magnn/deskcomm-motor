import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const orgDaArea = vi.fn();
let host: string | null = "meumisterio.com";
vi.mock("@/lib/area-do-cliente/sessao", () => ({ orgDaArea: (...a: unknown[]) => orgDaArea(...a) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(host ? { host } : {}) }));

const { generateMetadata, baseDoDominio } = await import("@/app/c/[org]/layout");

const meta = () => generateMetadata({ params: Promise.resolve({ org: "cigana-esmeralda" }) });

beforeEach(() => {
  orgDaArea.mockReset();
  host = "meumisterio.com";
});

describe("identidade da área em todas as páginas /c/<org>", () => {
  it("o layout declara favicon E ícone da Apple, com o desenho da empresa", async () => {
    orgDaArea.mockResolvedValue(null);
    const icons = (await meta()).icons as { icon: Array<{ url: string; type: string }>; apple: string };
    expect(icons.icon[0]).toMatchObject({ url: "/c/cigana-esmeralda/icone?t=192", type: "image/png" });
    expect(icons.apple).toBe("/c/cigana-esmeralda/icone?t=192");
  });

  it("aba, prévia de link e app são da empresa, nunca do produto", async () => {
    orgDaArea.mockResolvedValue({ slug: "cigana-esmeralda", nome: "Templo", config: { titulo: "Cigana Esmeralda" } });
    const m = await meta();
    expect(m.title).toEqual({ default: "Cigana Esmeralda", template: "%s · Cigana Esmeralda" });
    expect(m.openGraph).toMatchObject({ title: "Cigana Esmeralda", siteName: "Cigana Esmeralda" });
    expect(JSON.stringify(m.openGraph)).toContain("/c/cigana-esmeralda/icone?t=512");
    expect(m.manifest).toBe("/c/cigana-esmeralda/manifest");
    expect(m.keywords).toBeNull(); // as palavras do produto ("CRM", "WhatsApp") não descem para a área
    expect(String(m.metadataBase)).toBe("https://meumisterio.com/");
    expect(JSON.stringify(m)).not.toMatch(/acassia|whatsapp|crm/i);
  });

  it("o domínio só vira base quando tem forma de domínio", () => {
    expect(String(baseDoDominio("meumisterio.com"))).toBe("https://meumisterio.com/");
    expect(baseDoDominio("localhost:3000")).toBeUndefined();
    expect(baseDoDominio('evil.com"/><script>')).toBeUndefined();
    expect(baseDoDominio(null)).toBeUndefined();
  });

  it("a página não redeclara `icons` (declarar só `apple` apagava o favicon herdado)", () => {
    const pagina = readFileSync("app/c/[org]/page.tsx", "utf8");
    expect(pagina).not.toMatch(/\bicons\s*:/);
  });
});

describe("desenho do ícone da área", () => {
  it("usa a cor da empresa só quando é hex de 6 dígitos", async () => {
    const { corDoIcone } = await import("@/app/c/[org]/icone/route");
    expect(corDoIcone("#c0ffee")).toBe("#c0ffee");
    expect(corDoIcone('red"/><script>alert(1)</script>')).toBe("#7c3aed");
    expect(corDoIcone(null)).toBe("#7c3aed");
  });
});
