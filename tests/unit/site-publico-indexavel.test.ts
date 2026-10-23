import { beforeEach, describe, expect, it, vi } from "vitest";

const envFalso = vi.hoisted(() => ({
  PLANS_ENFORCED: "true",
  PLANS_CATALOG: "",
  NEXT_PUBLIC_APP_URL: "https://exemplo.test/",
}));
vi.mock("@/lib/env", () => ({ env: envFalso }));

import robots, { dynamic as dinamicoDoRobots } from "@/app/robots";
import sitemap, { dynamic as dinamicoDoSitemap } from "@/app/sitemap";
import { jsonLdDoGuia, serializarJsonLd } from "@/lib/site-publico/dados-estruturados";
import { guias } from "@/lib/site-publico/guias";
import { textoDoLlms } from "@/lib/site-publico/llms";
import { fatosDoServico } from "@/lib/site-publico/site";

/**
 * O site público só existe onde a instalação VENDE o serviço. Os dois lados se cobram: com planos,
 * buscador e robô de IA leem; sem planos, a instalação self-host segue invisível.
 */
describe("site público", () => {
  beforeEach(() => {
    envFalso.PLANS_ENFORCED = "true";
  });

  it("com planos: robots libera o site, os robôs de IA pelo nome e fecha o app", () => {
    const r = robots();
    const regras = Array.isArray(r.rules) ? r.rules : [r.rules];
    expect(regras[0]!).toMatchObject({ userAgent: "*", allow: "/" });
    expect(regras[0]!.disallow).toContain("/app");
    expect(regras[1]!.userAgent).toEqual(expect.arrayContaining(["GPTBot", "ClaudeBot", "PerplexityBot"]));
    expect(r.sitemap).toBe("https://exemplo.test/sitemap.xml");
  });

  it("com planos: sitemap traz a página inicial e todo guia", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://exemplo.test");
    for (const g of guias(fatosDoServico())) expect(urls).toContain(`https://exemplo.test/guias/${g.slug}`);
  });

  it("com planos: llms.txt cita os planos do catálogo e o completo traz os guias", () => {
    const curto = textoDoLlms(false) ?? "";
    expect(curto).toMatch(/^# /);
    for (const p of fatosDoServico().planos) expect(curto).toContain(p.nome);
    const completo = textoDoLlms(true) ?? "";
    expect(completo.length).toBeGreaterThan(curto.length);
    expect(completo).toContain(guias(fatosDoServico())[0]!.resposta);
  });

  it("sem planos: robots fecha tudo, sitemap vazio e sem llms.txt", () => {
    envFalso.PLANS_ENFORCED = "false";
    expect(robots().rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(sitemap()).toEqual([]);
    expect(textoDoLlms(false)).toBeNull();
  });

  it("robots e sitemap são lidos em runtime, nunca congelados no build", () => {
    // A imagem é pré-buildada sem `PLANS_ENFORCED`: estático congelaria "não vende" (produção, 23/10/2026).
    expect(dinamicoDoRobots).toBe("force-dynamic");
    expect(dinamicoDoSitemap).toBe("force-dynamic");
  });

  it("JSON-LD escapa `<` para não fechar o <script>", () => {
    const fatos = fatosDoServico();
    const guia = { ...guias(fatos)[0]!, titulo: "</script><script>alert(1)</script>" };
    expect(serializarJsonLd(jsonLdDoGuia(fatos, guia))).not.toContain("</script>");
  });
});
