/**
 * A VOZ SÓ ONDE PESA, E UMA RESERVA QUANDO A COTA ACABA.
 *
 * Medido em produção de 06 a 11/10/2026: no espelho puro a agente mandou 14 áudios por conversa, e
 * a voz custou quase o mesmo que toda a IA de texto, usada em 7% das conversas.
 */
import { describe, expect, it } from "vitest";

import { configDaReserva, prepararNotasDeVoz, type DependenciasDeNota } from "@/lib/agent-engine/agent/nota-de-voz";
import { deveResponderEmAudio } from "@/lib/voz/decisao";
import { ErroDeVoz } from "@/lib/voz/erros";
import { MIME_DA_NOTA_DE_VOZ, voiceReplySchema, type VoiceReplyConfig } from "@/lib/voz/tipos";

const CURTA = "Tá bom, meu bem.";
const LONGA =
  "A primeira carta que saiu na sua mesa foi o Eremita. Ele fala de um tempo de recolhimento, de quem precisou se afastar para entender o que sente. " +
  "Não é abandono, é silêncio. E a carta ao lado mostra que esse silêncio ainda tem você dentro dele.";

describe("modo mirror_long — o espelho só nas respostas longas", () => {
  const config = { mode: "mirror_long" as const, min_chars_for_voice: 200 };

  it("⭐ pessoa mandou áudio e a resposta é longa: fala", () => {
    expect(deveResponderEmAudio(config, { pessoaMandouAudio: true, texto: LONGA })).toBe(true);
  });

  it("⭐ pessoa mandou áudio e a resposta é curta: escreve", () => {
    expect(deveResponderEmAudio(config, { pessoaMandouAudio: true, texto: CURTA })).toBe(false);
  });

  it("pessoa escreveu: escreve, mesmo que a resposta seja longa", () => {
    expect(deveResponderEmAudio(config, { pessoaMandouAudio: false, texto: LONGA })).toBe(false);
  });

  it("link e emoji não contam para o tamanho", () => {
    const quaseSoLink = "Aqui está: https://pay.cakto.com.br/" + "x".repeat(300) + " 🌙";
    expect(deveResponderEmAudio(config, { pessoaMandouAudio: true, texto: quaseSoLink })).toBe(false);
  });

  it("os modos antigos não mudaram", () => {
    expect(deveResponderEmAudio({ mode: "mirror", min_chars_for_voice: 200 }, { pessoaMandouAudio: true, texto: CURTA })).toBe(true);
    expect(deveResponderEmAudio({ mode: "mirror", min_chars_for_voice: 200 }, { pessoaMandouAudio: false, texto: LONGA })).toBe(false);
    expect(deveResponderEmAudio({ mode: "moments", min_chars_for_voice: 200 }, { pessoaMandouAudio: false, texto: LONGA })).toBe(true);
    expect(deveResponderEmAudio({ mode: "moments", min_chars_for_voice: 200 }, { pessoaMandouAudio: true, texto: CURTA })).toBe(true);
  });
});

const COM_RESERVA: VoiceReplyConfig = voiceReplySchema.parse({
  enabled: true,
  provider: "elevenlabs",
  voice_id: "voz-principal",
  stability: 0.35,
  reserva: { provider: "openai", voice_id: "marin", style_instructions: "Voz calma." },
});

function dependencias(sintetizar: DependenciasDeNota["sintetizar"], chaves: Record<string, string | null> = { elevenlabs: "k-el", openai: "k-oa" }) {
  const avisos: string[] = [];
  const deps: DependenciasDeNota = {
    resolverChave: async (_org, provedor) => chaves[provedor] ?? null,
    sintetizar,
    guardar: async () => true,
    log: { warn: (msg) => void avisos.push(msg) },
  };
  return { deps, avisos };
}
const PEDIDO = { tenantId: "org-1", conversationId: "conv-1", texto: "Oi, meu bem. Vamos olhar a sua mesa com calma." };
const audio = { buffer: Buffer.from("ogg"), mime: MIME_DA_NOTA_DE_VOZ };

describe("reserva de voz — quando a cota do provedor principal acaba", () => {
  it("⭐ cota esgotada: a resposta sai em áudio pela reserva, com a voz e a chave dela", async () => {
    const pedidos: Array<{ provedor: string; apiKey: string; voz: string }> = [];
    const { deps, avisos } = dependencias(async (p) => {
      pedidos.push({ provedor: p.provedor, apiKey: p.apiKey, voz: p.config.voice_id });
      if (p.provedor === "elevenlabs") throw new ErroDeVoz("limite_do_provedor", 401);
      return audio;
    });

    const r = await prepararNotasDeVoz(deps, { ...PEDIDO, config: COM_RESERVA });

    expect(r.ok).toBe(true);
    expect(pedidos.at(-1)).toEqual({ provedor: "openai", apiKey: "k-oa", voz: "marin" });
    expect(avisos.join(" | ")).toContain("saiu pela reserva");
  });

  it("enquanto o principal responde, a reserva não é chamada", async () => {
    const provedores: string[] = [];
    const { deps } = dependencias(async (p) => {
      provedores.push(p.provedor);
      return audio;
    });

    expect((await prepararNotasDeVoz(deps, { ...PEDIDO, config: COM_RESERVA })).ok).toBe(true);
    expect(provedores).toEqual(["elevenlabs"]);
  });

  it("⭐ defeito de configuração do principal NÃO é escondido pela reserva", async () => {
    const provedores: string[] = [];
    const { deps } = dependencias(async (p) => {
      provedores.push(p.provedor);
      throw new ErroDeVoz("chave_invalida", 401);
    });

    const r = await prepararNotasDeVoz(deps, { ...PEDIDO, config: COM_RESERVA });
    expect(r).toEqual({ ok: false, motivo: "chave_invalida" });
    expect(provedores).toEqual(["elevenlabs"]);
  });

  it("sem reserva configurada, cota esgotada cai para texto como sempre", async () => {
    const semReserva = voiceReplySchema.parse({ enabled: true, provider: "elevenlabs", voice_id: "voz-principal" });
    const { deps } = dependencias(async () => {
      throw new ErroDeVoz("limite_do_provedor", 429);
    });
    expect(await prepararNotasDeVoz(deps, { ...PEDIDO, config: semReserva })).toEqual({ ok: false, motivo: "limite_do_provedor" });
  });

  it("reserva sem chave cadastrada, ou que também falha: cai para texto", async () => {
    const falhaNoPrincipal: DependenciasDeNota["sintetizar"] = async (p) => {
      if (p.provedor === "elevenlabs") throw new ErroDeVoz("limite_do_provedor", 401);
      throw new ErroDeVoz("provedor_fora_do_ar", 503);
    };
    const semChave = dependencias(falhaNoPrincipal, { elevenlabs: "k-el", openai: null });
    expect((await prepararNotasDeVoz(semChave.deps, { ...PEDIDO, config: COM_RESERVA })).ok).toBe(false);
    const comFalha = dependencias(falhaNoPrincipal);
    expect(await prepararNotasDeVoz(comFalha.deps, { ...PEDIDO, config: COM_RESERVA })).toEqual({ ok: false, motivo: "limite_do_provedor" });
  });

  it("a reserva fala com os ajustes dela, não com os do principal", () => {
    const r = configDaReserva(COM_RESERVA);
    expect(r).toMatchObject({ provider: "openai", voice_id: "marin", style_instructions: "Voz calma." });
    expect(r?.stability).toBeUndefined();
    expect(r?.reserva).toBeUndefined();
  });

  it("reserva igual ao principal não é reserva", () => {
    const igual = voiceReplySchema.parse({ enabled: true, provider: "openai", voice_id: "coral", reserva: { provider: "openai", voice_id: "marin" } });
    expect(configDaReserva(igual)).toBeNull();
  });
});
