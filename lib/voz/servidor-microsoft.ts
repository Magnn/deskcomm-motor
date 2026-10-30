/**
 * A VOZ DA MICROSOFT DO PRÓPRIO SERVIDOR — as vozes neurais do Edge, por um serviço que a instalação
 * roda (`ops/vps/voz-microsoft`), sem custo por caractere e bem mais rápidas que o Kokoro.
 *
 * Não é um serviço contratado: pode falhar ou mudar sem aviso, então a agente deve ter uma reserva em
 * "Se a voz principal falhar". Configuração da instalação, no `.env`: `VOZ_MICROSOFT_BASE_URL` e
 * `VOZ_MICROSOFT_API_KEY`. Sem endereço, estas vozes não aparecem.
 */
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { env } from "@/lib/env";

import { VozPropriaIndisponivel } from "./servidor-proprio";
import type { VozDisponivel } from "./tipos";

/** O serviço repete até 4 vezes, com limite de 8 s em cada: mais que isso, a reserva assume. */
const TEMPO_MAXIMO_MS = 36_000;
const MAX_ENTRADA = 6000;

export const VOZES_DA_MICROSOFT: readonly VozDisponivel[] = [
  { provedor: "servidor", id: "ms_francisca", nome: "Francisca", genero: "feminina", categoria: "pronta", descricao: "Feminina, português do Brasil, a mais estável." },
  { provedor: "servidor", id: "ms_thalita", nome: "Thalita", genero: "feminina", categoria: "pronta", descricao: "Feminina, português do Brasil, falha mais e demora quando repete." },
];

export function vozMicrosoftConfigurada(): boolean {
  return env.VOZ_MICROSOFT_BASE_URL.trim() !== "";
}

export function ehVozDaMicrosoft(vozId: string): boolean {
  return vozId.startsWith("ms_");
}

/** Fala o `texto` em mp3. Lança `VozPropriaIndisponivel`, como a voz própria. */
export async function falarComVozDaMicrosoft(
  texto: string,
  vozId: string,
  opts: { velocidade?: number; fetchImpl?: typeof fetch } = {},
): Promise<Buffer> {
  const base = env.VOZ_MICROSOFT_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) throw new VozPropriaIndisponivel("voz da Microsoft não configurada");
  const recusa = await motivoDaRecusaDeDestino(base, "instalacao");
  if (recusa) throw new VozPropriaIndisponivel(`destino recusado: ${recusa}`);
  const chave = env.VOZ_MICROSOFT_API_KEY.trim();
  const res = await (opts.fetchImpl ?? fetch)(`${base}/v1/audio/speech`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(chave ? { Authorization: `Bearer ${chave}` } : {}) },
    body: JSON.stringify({
      voice: vozId,
      input: texto.slice(0, MAX_ENTRADA),
      ...(opts.velocidade ? { speed: opts.velocidade } : {}),
    }),
    signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  }).catch((err: unknown) => {
    throw new VozPropriaIndisponivel(err instanceof Error ? err.message : String(err));
  });
  if (!res.ok) throw new VozPropriaIndisponivel(`voz da Microsoft respondeu ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new VozPropriaIndisponivel("voz da Microsoft devolveu áudio vazio");
  return buffer;
}
