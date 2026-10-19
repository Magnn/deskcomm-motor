/**
 * A VOZ DO SERVIDOR como provedor da agente (pedido do dono em 19/10/2026: notas de voz do WhatsApp sem
 * pagar a ElevenLabs por caractere — modelo aberto rodando na VPS).
 *
 * O que este arquivo guarda:
 *  - a pré-escuta sai em mp3 e a nota de voz passa pela conversão para Ogg/Opus (o serviço só fala mp3);
 *  - serviço fora do ar vira `provedor_fora_do_ar` e sem configuração vira `sem_chave` — o turno cai para
 *    texto pelo caminho de sempre;
 *  - a "chave" é da instalação: configurada, há marcador; sem configuração, `null`; nunca consulta a
 *    organização;
 *  - a tela de Credenciais e a rota de credenciais não oferecem a voz do servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  configurada: true,
  falar: vi.fn(),
  converter: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/voz/servidor-proprio", () => ({
  VozPropriaIndisponivel: class extends Error {},
  vozPropriaConfigurada: () => h.configurada,
  falarNaVozPropria: h.falar,
}));
vi.mock("@/lib/voz/converter", () => ({ converterParaNotaDeVoz: h.converter }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: h.from }) }));

import { resolverChaveDeVoz } from "@/lib/voz/chaves";
import { ErroDeVoz } from "@/lib/voz/erros";
import { VOZES_DO_SERVIDOR, servidorVoz } from "@/lib/voz/provedores/servidor";
import { VozPropriaIndisponivel } from "@/lib/voz/servidor-proprio";
import { IDS_DE_PROVEDOR_DE_VOZ, IDS_DE_PROVEDOR_DE_VOZ_COM_CHAVE, PROVEDORES_SO_DE_VOZ } from "@/lib/voz/tipos";

beforeEach(() => {
  h.configurada = true;
  h.falar.mockReset().mockResolvedValue(Buffer.from("mp3"));
  h.converter.mockReset().mockResolvedValue({ buffer: Buffer.from("ogg"), mime: "audio/ogg;codecs=opus" });
  h.from.mockReset();
});

describe("voz do servidor: síntese", () => {
  it("vozes em português do Brasil, femininas e masculinas", async () => {
    const vozes = await servidorVoz.listarVozes("servidor");
    expect(vozes).toEqual(VOZES_DO_SERVIDOR);
    expect(vozes.some((v) => v.genero === "feminina")).toBe(true);
    expect(vozes.every((v) => v.provedor === "servidor")).toBe(true);
  });

  it("pré-escuta: o mp3 do serviço, sem conversão", async () => {
    const a = await servidorVoz.sintetizar({ apiKey: "servidor", vozId: "pf_dora", texto: "Oi", formato: "previa", ajustes: { speed: 0.9 } });
    expect(a.mime).toBe("audio/mpeg");
    expect(h.falar).toHaveBeenCalledWith("Oi", { voz: "pf_dora", velocidade: 0.9 });
    expect(h.converter).not.toHaveBeenCalled();
  });

  it("nota de voz: converte o mp3 para Ogg/Opus", async () => {
    const a = await servidorVoz.sintetizar({ apiKey: "servidor", vozId: "pf_dora", texto: "Oi", formato: "nota_de_voz" });
    expect(h.converter).toHaveBeenCalledWith(Buffer.from("mp3"));
    expect(a.mime).toBe("audio/ogg;codecs=opus");
  });

  it("serviço fora do ar: provedor_fora_do_ar; sem configuração: sem_chave", async () => {
    h.falar.mockRejectedValue(new VozPropriaIndisponivel("x"));
    const pedido = { apiKey: "servidor", vozId: "pf_dora", texto: "Oi", formato: "nota_de_voz" as const };
    await expect(servidorVoz.sintetizar(pedido)).rejects.toMatchObject({ codigo: "provedor_fora_do_ar" });
    h.configurada = false;
    await expect(servidorVoz.sintetizar(pedido)).rejects.toBeInstanceOf(ErroDeVoz);
    await expect(servidorVoz.sintetizar(pedido)).rejects.toMatchObject({ codigo: "sem_chave" });
  });
});

describe("voz do servidor: a chave é da instalação", () => {
  it("configurada: marcador; sem configuração: null; nunca lê a organização", async () => {
    expect(await resolverChaveDeVoz("org-1", "servidor")).toBe("servidor");
    h.configurada = false;
    expect(await resolverChaveDeVoz("org-1", "servidor")).toBeNull();
    expect(h.from).not.toHaveBeenCalled();
  });

  it("a organização não cadastra chave da voz do servidor", () => {
    expect(IDS_DE_PROVEDOR_DE_VOZ).toContain("servidor");
    expect(IDS_DE_PROVEDOR_DE_VOZ_COM_CHAVE).not.toContain("servidor");
    expect(PROVEDORES_SO_DE_VOZ.map((p) => p.id)).not.toContain("servidor");
  });
});
