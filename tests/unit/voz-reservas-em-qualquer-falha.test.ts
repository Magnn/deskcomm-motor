/**
 * AS RESERVAS DE VOZ EM ORDEM, EM QUALQUER FALHA (pedido do dono em 19/10/2026: "deixa a voz do
 * servidor como principal e, se der erro, a agente usa a OpenAI ou a ElevenLabs").
 *
 * O que este arquivo guarda:
 *  - com `qualquer_falha`, qualquer erro da principal chama as reservas, NA ORDEM, até uma falar;
 *  - a principal que passa do prazo (`espera_maxima_s`) também cede a vez;
 *  - principal sem chave também cede a vez em `qualquer_falha`;
 *  - nenhuma reserva funcionou: cai para texto com o motivo da principal;
 *  - o padrão (`cota`) continua como sempre: só a cota esgotada chama a reserva;
 *  - a `reserva` única de antes ainda vale quando não há `reservas`.
 */
import { describe, expect, it } from "vitest";

import { configsDasReservas, prepararNotasDeVoz, type DependenciasDeNota } from "@/lib/agent-engine/agent/nota-de-voz";
import { ErroDeVoz } from "@/lib/voz/erros";
import { MIME_DA_NOTA_DE_VOZ, voiceReplySchema } from "@/lib/voz/tipos";

const PEDIDO = { tenantId: "org-1", conversationId: "conv-1", texto: "Oi, meu bem. Vamos olhar a sua mesa com calma." };
const audio = { buffer: Buffer.from("ogg"), mime: MIME_DA_NOTA_DE_VOZ };

const SERVIDOR_PRIMEIRO = voiceReplySchema.parse({
  enabled: true,
  provider: "servidor",
  voice_id: "clone-da-cigana",
  reserva_em: "qualquer_falha",
  espera_maxima_s: 5,
  reservas: [
    { provider: "elevenlabs", voice_id: "lily" },
    { provider: "openai", voice_id: "coral" },
  ],
});

function dependencias(sintetizar: DependenciasDeNota["sintetizar"], chaves: Record<string, string | null> = { servidor: "servidor", elevenlabs: "k-el", openai: "k-oa" }) {
  const avisos: string[] = [];
  const deps: DependenciasDeNota = {
    resolverChave: async (_org, provedor) => chaves[provedor] ?? null,
    sintetizar,
    guardar: async () => true,
    log: { warn: (msg) => void avisos.push(msg) },
  };
  return { deps, avisos };
}

describe("reservas em qualquer falha", () => {
  it("⭐ a voz do servidor cai: fala a primeira reserva", async () => {
    const vozes: string[] = [];
    const { deps, avisos } = dependencias(async (p) => {
      vozes.push(`${p.provedor}:${p.config.voice_id}`);
      if (p.provedor === "servidor") throw new ErroDeVoz("provedor_fora_do_ar", 503);
      return audio;
    });
    const r = await prepararNotasDeVoz(deps, { ...PEDIDO, config: SERVIDOR_PRIMEIRO });
    expect(r.ok).toBe(true);
    expect(vozes).toEqual(["servidor:clone-da-cigana", "elevenlabs:lily"]);
    expect(avisos.join(" | ")).toContain("saiu pela reserva");
  });

  it("⭐ a primeira reserva também falha: tenta a segunda, na ordem", async () => {
    const provedores: string[] = [];
    const { deps } = dependencias(async (p) => {
      provedores.push(p.provedor);
      if (p.provedor !== "openai") throw new ErroDeVoz("chave_invalida", 401);
      return audio;
    });
    expect((await prepararNotasDeVoz(deps, { ...PEDIDO, config: SERVIDOR_PRIMEIRO })).ok).toBe(true);
    expect(provedores).toEqual(["servidor", "elevenlabs", "openai"]);
  });

  it("⭐ a principal demora mais que o prazo: a reserva fala", async () => {
    const config = { ...SERVIDOR_PRIMEIRO, espera_maxima_s: 0.05 };
    const { deps } = dependencias(async (p) => {
      if (p.provedor === "servidor") return new Promise((resolve) => setTimeout(() => resolve(audio), 2000));
      return audio;
    });
    const r = await prepararNotasDeVoz(deps, { ...PEDIDO, config });
    expect(r.ok).toBe(true);
  });

  it("principal sem chave (voz do servidor desligada): a reserva fala", async () => {
    const provedores: string[] = [];
    const { deps } = dependencias(
      async (p) => {
        provedores.push(p.provedor);
        return audio;
      },
      { servidor: null, elevenlabs: "k-el", openai: "k-oa" },
    );
    expect((await prepararNotasDeVoz(deps, { ...PEDIDO, config: SERVIDOR_PRIMEIRO })).ok).toBe(true);
    expect(provedores).toEqual(["elevenlabs"]);
  });

  it("nenhuma funcionou: texto, com o motivo da principal", async () => {
    const { deps } = dependencias(async () => {
      throw new ErroDeVoz("provedor_fora_do_ar", 503);
    });
    expect(await prepararNotasDeVoz(deps, { ...PEDIDO, config: SERVIDOR_PRIMEIRO })).toEqual({ ok: false, motivo: "provedor_fora_do_ar" });
  });

  it("no padrão (só cota), defeito da principal não chama reserva", async () => {
    const config = voiceReplySchema.parse({ ...SERVIDOR_PRIMEIRO, reserva_em: "cota" });
    const provedores: string[] = [];
    const { deps } = dependencias(async (p) => {
      provedores.push(p.provedor);
      throw new ErroDeVoz("provedor_fora_do_ar", 503);
    });
    expect((await prepararNotasDeVoz(deps, { ...PEDIDO, config })).ok).toBe(false);
    expect(provedores).toEqual(["servidor"]);
  });

  it("a reserva única de antes ainda vale quando não há lista", () => {
    const legado = voiceReplySchema.parse({ enabled: true, provider: "elevenlabs", voice_id: "x", reserva: { provider: "openai", voice_id: "marin" } });
    expect(configsDasReservas(legado).map((c) => c.provider)).toEqual(["openai"]);
  });

  it("reserva idêntica à principal é ignorada; mesma casa com outra voz vale", () => {
    const config = voiceReplySchema.parse({
      ...SERVIDOR_PRIMEIRO,
      reservas: [
        { provider: "servidor", voice_id: "clone-da-cigana" },
        { provider: "servidor", voice_id: "pf_dora" },
      ],
    });
    expect(configsDasReservas(config).map((c) => c.voice_id)).toEqual(["pf_dora"]);
  });
});
