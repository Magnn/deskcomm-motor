import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/plataformas-de-anuncio/meta/login", () => ({
  appDoMetaAds: async () => ({ appId: "app1", appSecret: "seg", configId: null }),
  redirectDoMetaAds: () => "https://desk.exemplo/api/v1/plataformas-de-anuncio/meta/callback",
  verificarEstado: () => null,
  contaPadraoDepoisDeConectar: () => null,
}));
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://desk.exemplo", INTERNAL_SECRET: "um-segredo-bem-longo-0123456789" } }));

import { GET } from "@/app/api/v1/plataformas-de-anuncio/meta/callback/route";

/**
 * A volta do Facebook chega de OUTRO site. Um 302 daqui para a tela levaria o
 * navegador sem o cookie `SameSite=Strict`, e a pessoa cairia no login logo
 * depois de conectar — relatado em produção em 04/10/2026.
 */
describe("a volta do Facebook não desloga", () => {
  it("responde uma página nossa que navega, em vez de redirecionar", async () => {
    const res = await GET(new NextRequest("https://desk.exemplo/api/v1/plataformas-de-anuncio/meta/callback?state=x"));

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain('location.replace("https://desk.exemplo/app/settings/meta-ads?erro=sessao_expirada")');
    // Sem JavaScript, a mesma navegação por meta refresh e por link.
    expect(html).toContain('content="0;url=https://desk.exemplo/app/settings/meta-ads?erro=sessao_expirada"');
  });
});
