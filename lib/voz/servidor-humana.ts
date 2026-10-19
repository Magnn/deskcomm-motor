/**
 * A VOZ HUMANA DO PRÓPRIO SERVIDOR — o serviço `ops/vps/voz-humana` (Chatterbox Multilingual, MIT),
 * para o que não tem pressa: a leitura narrada, a carta do dia, as boas-vindas.
 *
 * É uma FILA, não uma resposta na hora: medido na VPS em 19/10/2026, o Chatterbox leva ~4x o tempo da
 * própria fala sem GPU. Quem pede recebe o estado (`na_fila`, `gerando`, `pronto`, `falhou`) e volta
 * para buscar; o id do trabalho é de quem pede (ex.: `leitura-<id>`), então pedir de novo não duplica.
 *
 * Configuração da instalação, no `.env`: `VOZ_HUMANA_BASE_URL` e `VOZ_HUMANA_API_KEY`. Sem endereço,
 * não há voz humana e quem chama usa a voz rápida.
 */
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { env } from "@/lib/env";

export type EstadoDoTrabalho = "na_fila" | "gerando" | "pronto" | "falhou";

export interface TrabalhoDeVoz {
  id: string;
  status: EstadoDoTrabalho;
  /** Lugar na fila (1 = o próximo); 0 quando não está esperando. */
  posicao: number;
}

export class VozHumanaIndisponivel extends Error {}

export function vozHumanaConfigurada(): boolean {
  return env.VOZ_HUMANA_BASE_URL.trim() !== "";
}

async function chamar(caminho: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const base = env.VOZ_HUMANA_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) throw new VozHumanaIndisponivel("voz humana não configurada");
  const recusa = await motivoDaRecusaDeDestino(base, "instalacao");
  if (recusa) throw new VozHumanaIndisponivel(`destino recusado: ${recusa}`);
  const res = await fetchImpl(`${base}${caminho}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${env.VOZ_HUMANA_API_KEY.trim()}` },
    signal: AbortSignal.timeout(30_000),
  }).catch((err: unknown) => {
    throw new VozHumanaIndisponivel(err instanceof Error ? err.message : String(err));
  });
  if (!res.ok) throw new VozHumanaIndisponivel(`voz humana respondeu ${res.status}`);
  return res;
}

/** Põe o texto na fila (ou devolve o trabalho que já existe com esse id). */
export async function pedirVozHumana(
  p: { id: string; texto: string; voz?: string },
  fetchImpl?: typeof fetch,
): Promise<TrabalhoDeVoz> {
  const res = await chamar(
    "/v1/trabalhos",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, input: p.texto, voice: p.voz ?? "" }),
    },
    fetchImpl,
  );
  return (await res.json()) as TrabalhoDeVoz;
}

/** O mp3 pronto. */
export async function baixarVozHumana(id: string, fetchImpl?: typeof fetch): Promise<Buffer> {
  const res = await chamar(`/v1/trabalhos/${encodeURIComponent(id)}/audio`, { method: "GET" }, fetchImpl);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new VozHumanaIndisponivel("áudio vazio");
  return buffer;
}
