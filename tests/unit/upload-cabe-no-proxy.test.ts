/**
 * O maior upload que as rotas aceitam tem de caber no corpo que o Next guarda
 * para o handler quando há `proxy.ts`. Sem o knob, o padrão (10 MB) corta o
 * corpo e todo arquivo maior volta 422 com a tela prometendo 50 MB.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

describe("upload cabe no corpo que o proxy entrega ao handler", () => {
  it("proxyClientMaxBodySize cobre o teto do bucket mais o envelope multipart", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const achado = /proxyClientMaxBodySize:\s*([0-9_]+)\s*\+\s*([0-9_]+)/.exec(config);
    expect(achado, "next.config.ts precisa declarar experimental.proxyClientMaxBodySize").not.toBeNull();
    const [, teto, folga] = achado!;
    const limite = Number(teto!.replaceAll("_", "")) + Number(folga!.replaceAll("_", ""));
    expect(limite).toBeGreaterThanOrEqual(MAX_MEDIA_BYTES + 1_048_576);
  });
});
