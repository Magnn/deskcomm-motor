/**
 * A VOZ CLONADA DO PRÓPRIO SERVIDOR — o serviço `ops/vps/voz-clonada` (OpenVoice V2 sobre o Kokoro,
 * sem custo por caractere). Guarda o timbre de uma gravação e fala qualquer texto com ele.
 *
 * Configuração da instalação, no `.env`: `VOZ_CLONADA_BASE_URL` e `VOZ_CLONADA_API_KEY`. Sem
 * endereço, não há clonagem no servidor (a ElevenLabs continua clonando como sempre).
 *
 * Medido na VPS em 19/10/2026: ~25 s de fala clonada em ~19 s (fala do Kokoro + troca de timbre).
 * O serviço grava marca d'água inaudível em todo áudio: a voz clonada é identificável como sintética.
 */
import { motivoDaRecusaDeDestino } from "@/lib/automation/destinos-internos-autorizados";
import { env } from "@/lib/env";

import { ErroDeVoz } from "./erros";
import type { GeneroDaVoz, VozDisponivel } from "./tipos";

/** O id das vozes clonadas no serviço começa assim — é o que separa clone de voz pronta do Kokoro. */
export const PREFIXO_DA_VOZ_CLONADA = "clone_";
const TEMPO_DA_FALA_MS = 120_000;

export function vozClonadaConfigurada(): boolean {
  return env.VOZ_CLONADA_BASE_URL.trim() !== "";
}

export function ehVozClonadaDoServidor(vozId: string): boolean {
  return vozId.startsWith(PREFIXO_DA_VOZ_CLONADA);
}

async function chamar(caminho: string, init: RequestInit & { tempoMs?: number }, fetchImpl: typeof fetch = fetch): Promise<Response> {
  const base = env.VOZ_CLONADA_BASE_URL.trim().replace(/\/+$/, "");
  if (!base) throw new ErroDeVoz("sem_chave");
  const recusa = await motivoDaRecusaDeDestino(base, "instalacao");
  if (recusa) throw new ErroDeVoz("recusado", null, `destino: ${recusa}`);
  const res = await fetchImpl(`${base}${caminho}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${env.VOZ_CLONADA_API_KEY.trim()}` },
    signal: AbortSignal.timeout(init.tempoMs ?? 30_000),
  }).catch((err: unknown) => {
    throw new ErroDeVoz("provedor_fora_do_ar", null, err instanceof Error ? err.message : String(err));
  });
  if (res.status === 401 || res.status === 403) throw new ErroDeVoz("chave_invalida", res.status);
  if (res.status === 404) throw new ErroDeVoz("voz_inexistente", 404);
  if (res.status === 413 || res.status === 422) throw new ErroDeVoz("amostra_invalida", res.status);
  if (!res.ok) throw new ErroDeVoz("provedor_fora_do_ar", res.status);
  return res;
}

export async function listarVozesClonadas(fetchImpl?: typeof fetch): Promise<VozDisponivel[]> {
  if (!vozClonadaConfigurada()) return [];
  const res = await chamar("/v1/vozes", { method: "GET" }, fetchImpl);
  const j = (await res.json()) as { data?: Array<{ id: string; nome: string; genero: string }> };
  return (j.data ?? []).map((v) => ({
    provedor: "servidor",
    id: v.id,
    nome: v.nome,
    genero: v.genero === "masculina" ? "masculina" : "feminina",
    categoria: "clonada",
    descricao: "Clonada no servidor, sem custo por uso.",
  }));
}

export async function clonarNoServidor(
  p: { nome: string; genero: GeneroDaVoz; amostras: Array<{ nome: string; tipo: string; dados: Uint8Array }> },
  fetchImpl?: typeof fetch,
): Promise<VozDisponivel> {
  const corpo = new FormData();
  corpo.append("nome", p.nome);
  // A voz base do serviço é feminina ou masculina; "neutra" fala sobre a base feminina.
  corpo.append("genero", p.genero === "masculina" ? "masculina" : "feminina");
  for (const a of p.amostras) corpo.append("arquivos", new Blob([a.dados as BlobPart], { type: a.tipo }), a.nome);
  const res = await chamar("/v1/vozes", { method: "POST", body: corpo, tempoMs: 120_000 }, fetchImpl);
  const v = (await res.json()) as { id: string; nome: string };
  return { provedor: "servidor", id: v.id, nome: v.nome, genero: p.genero, categoria: "clonada" };
}

export async function apagarVozClonada(vozId: string, fetchImpl?: typeof fetch): Promise<void> {
  await chamar(`/v1/vozes/${encodeURIComponent(vozId)}`, { method: "DELETE" }, fetchImpl);
}

/** Fala o texto com a voz clonada, em mp3. */
export async function falarComVozClonada(
  texto: string,
  vozId: string,
  opts: { velocidade?: number; fetchImpl?: typeof fetch } = {},
): Promise<Buffer> {
  const res = await chamar(
    "/v1/audio/speech",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: vozId, input: texto, response_format: "mp3", ...(opts.velocidade ? { speed: opts.velocidade } : {}) }),
      tempoMs: TEMPO_DA_FALA_MS,
    },
    opts.fetchImpl,
  );
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) throw new ErroDeVoz("provedor_fora_do_ar", null, "áudio vazio");
  return buffer;
}
