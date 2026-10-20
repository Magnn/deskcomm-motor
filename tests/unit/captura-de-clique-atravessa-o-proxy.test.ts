/**
 * As rotas de captura de clique (landing → WhatsApp com `[ref:]`) são abertas pelo NAVEGADOR de quem clicou no
 * anúncio, sem sessão. Medido em 20/10/2026: a do Meta não estava na lista do proxy e respondia 401 — o botão da
 * landing levava a uma página de erro e o lead nem chegava ao WhatsApp.
 */
import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/auth/public-paths";

describe("captura de clique atravessa o proxy", () => {
  it("⭐ Meta e Google: um segmento só, sem sessão", () => {
    expect(isPublicPath("/api/v1/anuncios/meta/magno")).toBe(true);
    expect(isPublicPath("/api/v1/anuncios/google/magno")).toBe(true);
  });

  it("sub-caminho não nasce público de carona", () => {
    expect(isPublicPath("/api/v1/anuncios/meta/magno/outra")).toBe(false);
    expect(isPublicPath("/api/v1/anuncios/meta")).toBe(false);
  });
});
