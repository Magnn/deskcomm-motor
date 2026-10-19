/**
 * A VOZ DO PRÓPRIO SERVIDOR — síntese de fala num serviço aberto que a instalação roda (ex.: o
 * `speaches` com o Kokoro ou o Piper, os mesmos que já transcrevem os áudios), em vez de pagar por
 * caractere a um provedor.
 *
 * Contrato: a API de fala COMPATÍVEL com a da OpenAI (`POST <base>/v1/audio/speech`). Configuração
 * da instalação, no `.env`: `VOZ_PROPRIA_BASE_URL`, `VOZ_PROPRIA_API_KEY`, `VOZ_PROPRIA_MODELO` e
 * `VOZ_PROPRIA_VOZ`. Sem endereço, não há voz própria e quem chama segue sem áudio.
 *
 * O endereço passa pela mesma recusa de destino da transcrição antes de a chave sair daqui.
 */
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { env } from "@/lib/env";

/** Kokoro: o modelo aberto mais bem colocado nas comparações de voz, com vozes do português do Brasil. */
export const MODELO_PADRAO_DA_VOZ_PROPRIA = "speaches-ai/Kokoro-82M-v1.0-ONNX";
export const VOZ_PADRAO_DA_VOZ_PROPRIA = "pf_dora";
/** O Kokoro gera ~4× mais rápido que a fala em 6 núcleos; uma leitura longa leva até ~1 min. */
const TEMPO_MAXIMO_MS = 120_000;
const MAX_ENTRADA = 6000;

export function vozPropriaConfigurada(): boolean {
  return env.VOZ_PROPRIA_BASE_URL.trim() !== "";
}

export class VozPropriaIndisponivel extends Error {}

/** Fala o `texto` em mp3 (o formato que todo navegador toca). Lança `VozPropriaIndisponivel`. */
export async function falarNaVozPropria(
  texto: string,
  opts: { voz?: string; velocidade?: number; fetchImpl?: typeof fetch } = {},
): Promise<Buffer> {
  const base = env.VOZ_PROPRIA_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) throw new VozPropriaIndisponivel("voz própria não configurada");
  const recusa = await motivoDaRecusaDeDestino(base, "instalacao");
  if (recusa) throw new VozPropriaIndisponivel(`destino recusado: ${recusa}`);
  const chave = env.VOZ_PROPRIA_API_KEY.trim();
  const res = await (opts.fetchImpl ?? fetch)(`${base}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}) },
    body: JSON.stringify({
      model: env.VOZ_PROPRIA_MODELO.trim() || MODELO_PADRAO_DA_VOZ_PROPRIA,
      voice: opts.voz?.trim() || env.VOZ_PROPRIA_VOZ.trim() || VOZ_PADRAO_DA_VOZ_PROPRIA,
      input: texto.slice(0, MAX_ENTRADA),
      response_format: "mp3",
      ...(opts.velocidade ? { speed: opts.velocidade } : {}),
    }),
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  }).catch((err: unknown) => {
    throw new VozPropriaIndisponivel(err instanceof Error ? err.message : String(err));
  });
  if (!res.ok) throw new VozPropriaIndisponivel(`voz própria respondeu ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new VozPropriaIndisponivel("voz própria devolveu áudio vazio");
  return buffer;
}
