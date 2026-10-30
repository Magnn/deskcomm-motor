/**
 * A VOZ DA MICROSOFT no provedor do servidor (pedido do dono em 30/10/2026: a Dora soa amadora; as vozes
 * dos áudios das mandalas são grátis e melhores).
 *
 * O que este arquivo guarda:
 *  - a voz `ms_*` vai ao serviço da Microsoft, nunca ao Kokoro; a Dora segue no Kokoro;
 *  - sem configuração, as vozes não aparecem na lista;
 *  - serviço fora do ar vira `provedor_fora_do_ar`, que é o que aciona a reserva da agente.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { VOZ_MICROSOFT_BASE_URL: "https://voz.test/_microsoft", VOZ_MICROSOFT_API_KEY: "k" },
  kokoro: vi.fn(),
  converter: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: async () => null }));
vi.mock("@/lib/voz/servidor-proprio", () => ({
  VozPropriaIndisponivel: class extends Error {},
  vozPropriaConfigurada: () => true,
  falarNaVozPropria: h.kokoro,
}));
vi.mock("@/lib/voz/servidor-clonada", () => ({
  listarVozesClonadas: async () => [],
  ehVozClonadaDoServidor: () => false,
  falarComVozClonada: vi.fn(),
  clonarNoServidor: vi.fn(),
  apagarVozClonada: vi.fn(),
}));
vi.mock("@/lib/voz/converter", () => ({ converterParaNotaDeVoz: h.converter }));

import { ErroDeVoz } from "@/lib/voz/erros";
import { servidorVoz } from "@/lib/voz/provedores/servidor";

const mp3 = Buffer.alloc(2000, 1);
const pedido = { apiKey: "servidor", vozId: "ms_francisca", texto: "Oi", formato: "previa" as const };

beforeEach(() => {
  h.env.VOZ_MICROSOFT_BASE_URL = "https://voz.test/_microsoft";
  h.kokoro.mockReset().mockResolvedValue(mp3);
  h.converter.mockReset().mockResolvedValue({ buffer: Buffer.from("ogg"), mime: "audio/ogg;codecs=opus" });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(mp3, { status: 200 })));
});

describe("voz da Microsoft", () => {
  it("vai ao serviço da Microsoft com a chave, sem passar pelo Kokoro", async () => {
    const r = await servidorVoz.sintetizar({ ...pedido, ajustes: { speed: 0.9 } });
    expect(r.mime).toBe("audio/mpeg");
    expect(h.kokoro).not.toHaveBeenCalled();
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("https://voz.test/_microsoft/v1/audio/speech");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer k");
    expect(JSON.parse(String(init?.body))).toEqual({ voice: "ms_francisca", input: "Oi", speed: 0.9 });
  });

  it("a nota de voz sai convertida para o WhatsApp", async () => {
    const r = await servidorVoz.sintetizar({ ...pedido, formato: "nota_de_voz" });
    expect(h.converter).toHaveBeenCalledWith(mp3);
    expect(r.mime).toContain("ogg");
  });

  it("a Dora continua no Kokoro", async () => {
    await servidorVoz.sintetizar({ ...pedido, vozId: "pf_dora" });
    expect(h.kokoro).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aparece na lista só quando configurada", async () => {
    expect((await servidorVoz.listarVozes("servidor")).map((v) => v.id)).toContain("ms_francisca");
    h.env.VOZ_MICROSOFT_BASE_URL = "";
    expect((await servidorVoz.listarVozes("servidor")).map((v) => v.id)).not.toContain("ms_francisca");
  });

  it("serviço fora do ar aciona a reserva", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const erro = await servidorVoz.sintetizar(pedido).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeVoz);
    expect((erro as ErroDeVoz).codigo).toBe("provedor_fora_do_ar");
  });
});
