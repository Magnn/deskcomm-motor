/**
 * A VOZ CLONADA DO PRÓPRIO SERVIDOR (pedido do dono em 19/10/2026: "eu gravo uma voz no Voice Studio e
 * você usa", sem pagar a ElevenLabs por caractere).
 *
 * O que este arquivo guarda:
 *  - a voz `clone_…` vai ao serviço de clonagem; as prontas (`pf_dora`) continuam no Kokoro;
 *  - a lista da voz do servidor junta clonadas e prontas, e o serviço fora do ar não esconde as prontas;
 *  - clonar manda as gravações com nome e gênero (neutra fala sobre a base feminina);
 *  - as respostas do serviço viram o vocabulário de erros de voz (401, 404, 422, rede);
 *  - sem endereço configurado, nada é chamado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { VOZ_CLONADA_BASE_URL: "https://voz.test/_clonar", VOZ_CLONADA_API_KEY: "k", VOZ_PROPRIA_BASE_URL: "https://voz.test/_ouvir", VOZ_PROPRIA_API_KEY: "", VOZ_PROPRIA_MODELO: "", VOZ_PROPRIA_VOZ: "" },
  fetch: vi.fn(),
  converter: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: h.env }));
vi.mock("@/lib/automation/destinos-internos-autorizados", () => ({ motivoDaRecusaDeDestino: async () => null }));
vi.mock("@/lib/voz/converter", () => ({ converterParaNotaDeVoz: h.converter }));

import { servidorVoz } from "@/lib/voz/provedores/servidor";
import { clonarNoServidor, falarComVozClonada, listarVozesClonadas } from "@/lib/voz/servidor-clonada";

const MP3 = new Uint8Array(5000);

beforeEach(() => {
  h.env.VOZ_CLONADA_BASE_URL = "https://voz.test/_clonar";
  h.fetch.mockReset();
  h.converter.mockReset().mockResolvedValue({ buffer: Buffer.from("ogg"), mime: "audio/ogg;codecs=opus" });
  vi.stubGlobal("fetch", h.fetch);
});

describe("voz clonada do servidor", () => {
  it("⭐ voz clone_… vai ao serviço de clonagem; voz pronta continua no Kokoro", async () => {
    h.fetch.mockImplementation(async () => new Response(MP3, { status: 200 }));
    await servidorVoz.sintetizar({ apiKey: "servidor", vozId: "clone_abc", texto: "Oi", formato: "previa" });
    await servidorVoz.sintetizar({ apiKey: "servidor", vozId: "pf_dora", texto: "Oi", formato: "previa" });
    const urls = h.fetch.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(["https://voz.test/_clonar/v1/audio/speech", "https://voz.test/_ouvir/v1/audio/speech"]);
    const corpo = JSON.parse((h.fetch.mock.calls[0]![1] as RequestInit).body as string);
    expect(corpo).toMatchObject({ voice: "clone_abc", input: "Oi", response_format: "mp3" });
    expect(((h.fetch.mock.calls[0]![1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer k");
  });

  it("a nota de voz clonada também passa pela conversão para Ogg/Opus", async () => {
    h.fetch.mockResolvedValue(new Response(MP3, { status: 200 }));
    await servidorVoz.sintetizar({ apiKey: "servidor", vozId: "clone_abc", texto: "Oi", formato: "nota_de_voz" });
    expect(h.converter).toHaveBeenCalledOnce();
  });

  it("a lista junta clonadas e prontas; serviço fora do ar não esconde as prontas", async () => {
    h.fetch.mockResolvedValueOnce(Response.json({ data: [{ id: "clone_abc", nome: "Minha voz", genero: "feminina" }] }));
    const vozes = await servidorVoz.listarVozes("servidor");
    expect(vozes[0]).toMatchObject({ id: "clone_abc", categoria: "clonada", provedor: "servidor" });
    expect(vozes.some((v) => v.id === "pf_dora")).toBe(true);

    h.fetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const soProntas = await servidorVoz.listarVozes("servidor");
    expect(soProntas.every((v) => v.categoria === "pronta")).toBe(true);
  });

  it("clonar manda as gravações com nome e gênero; neutra fala sobre a base feminina", async () => {
    h.fetch.mockResolvedValue(Response.json({ id: "clone_novo", nome: "Cigana" }));
    const voz = await clonarNoServidor({ nome: "Cigana", genero: "neutra", amostras: [{ nome: "a.webm", tipo: "audio/webm", dados: MP3 }] });
    expect(voz).toMatchObject({ provedor: "servidor", id: "clone_novo", categoria: "clonada" });
    const corpo = (h.fetch.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(corpo.get("nome")).toBe("Cigana");
    expect(corpo.get("genero")).toBe("feminina");
    expect(corpo.getAll("arquivos")).toHaveLength(1);
  });

  it("as respostas do serviço viram o vocabulário de erros de voz", async () => {
    for (const [status, codigo] of [
      [401, "chave_invalida"],
      [404, "voz_inexistente"],
      [422, "amostra_invalida"],
      [500, "provedor_fora_do_ar"],
    ] as const) {
      h.fetch.mockResolvedValueOnce(new Response("x", { status }));
      await expect(falarComVozClonada("Oi", "clone_abc")).rejects.toMatchObject({ codigo });
    }
    h.fetch.mockRejectedValueOnce(new Error("timeout"));
    await expect(falarComVozClonada("Oi", "clone_abc")).rejects.toMatchObject({ codigo: "provedor_fora_do_ar" });
  });

  it("sem endereço configurado: nenhuma clonada e nada é chamado", async () => {
    h.env.VOZ_CLONADA_BASE_URL = "";
    expect(await listarVozesClonadas()).toEqual([]);
    await expect(falarComVozClonada("Oi", "clone_abc")).rejects.toMatchObject({ codigo: "sem_chave" });
    expect(h.fetch).not.toHaveBeenCalled();
  });
});
