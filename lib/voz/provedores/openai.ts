/**
 * Síntese de voz da OpenAI (`POST /v1/audio/speech`).
 *
 * Diferenças que mordem quem lê a documentação pela metade:
 *
 *  - `response_format: "opus"` devolve Ogg/Opus, que é exatamente a nota de voz
 *    do WhatsApp. Não há conversão. A checagem `ehOggOpus` existe porque isso é
 *    uma promessa da OpenAI, e a Meta só reclama DEPOIS de aceitar o envio.
 *  - `instructions` (o estilo da fala) só existe nos modelos `gpt-4o*`; e o
 *    contrário vale para `speed`, que os `gpt-4o*` não aceitam. Mandar o campo
 *    errado para o modelo errado devolve 400 — então cada um só vai ao modelo
 *    que o entende.
 *  - Não há endpoint de listagem de vozes: a lista é o catálogo estático.
 */
import { VOZES_DA_OPENAI, MODELO_PADRAO_DA_OPENAI, modeloDaOpenAiAceitaInstrucoes } from "../catalogo-openai";
import { ErroDeVoz } from "../erros";
import { erroDaResposta, fetchComTempo } from "../http";
import { ehOggOpus } from "../ogg";
import { MIME_DA_NOTA_DE_VOZ, type AudioGerado } from "../tipos";
import type { ImplementacaoDeVoz, PedidoDeSintese } from "./tipos";

const BASE = "https://api.openai.com/v1";
/** Limite de entrada da API. */
const MAX_ENTRADA = 4096;

export function corpoDaSinteseOpenAi(p: PedidoDeSintese): Record<string, unknown> {
  const modelo = p.ajustes?.model?.trim() || MODELO_PADRAO_DA_OPENAI;
  const aceitaInstrucoes = modeloDaOpenAiAceitaInstrucoes(modelo);
  return {
    model: modelo,
    voice: p.vozId,
    input: p.texto.slice(0, MAX_ENTRADA),
    response_format: p.formato === "previa" ? "mp3" : "opus",
    ...(aceitaInstrucoes && p.ajustes?.style_instructions
      ? { instructions: p.ajustes.style_instructions }
      : {}),
    ...(!aceitaInstrucoes && p.ajustes?.speed !== undefined ? { speed: p.ajustes.speed } : {}),
  };
}

export const openaiVoz: ImplementacaoDeVoz = {
  id: "openai",

  async listarVozes() {
    return [...VOZES_DA_OPENAI];
  },

  async sintetizar(p): Promise<AudioGerado> {
    const res = await fetchComTempo(
      `${BASE}/audio/speech`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpoDaSinteseOpenAi(p)),
      },
      30_000,
    );
    if (!res.ok) throw await erroDaResposta(res, "sintese");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (p.formato === "previa") return { buffer, mime: "audio/mpeg" };
    if (!ehOggOpus(buffer)) throw new ErroDeVoz("formato_invalido");
    return { buffer, mime: MIME_DA_NOTA_DE_VOZ };
  },

  async validarChave(apiKey) {
    try {
      const res = await fetchComTempo(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } }, 8_000);
      if (res.status === 401 || res.status === 403) return { ok: false, error: "auth_failed_401" };
      return res.ok ? { ok: true } : { ok: false, error: `http_${res.status}` };
    } catch {
      return { ok: false, error: "network_error" };
    }
  },
};
