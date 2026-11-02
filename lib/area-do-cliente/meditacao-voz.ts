/**
 * A MEDITAÇÃO DA SEMANA FALADA (`meditacao.ts`) — narrada pela voz do próprio servidor, sem custo por uso.
 *
 * Com a voz da Microsoft (Francisca), cada trecho é falado à parte e os trechos são emendados com SILÊNCIO DE
 * VERDADE: quadros MP3 mudos no mesmo formato que o serviço devolve (24 kHz, 48 kbps, mono). É o silêncio que
 * faz a meditação funcionar — um "…" no texto vira meio segundo, não oito. Sem ela, o Kokoro fala tudo de uma
 * vez, com as pausas curtas da pontuação.
 *
 * Gerada uma vez por pessoa por semana e guardada no Storage (`<org>/meditacao/<contato>/<semana>.mp3`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKET_DAS_FOTOS } from "@/lib/catalogo/fotos";
import { logger } from "@/lib/logger";
import { falarComVozDaMicrosoft, vozMicrosoftConfigurada } from "@/lib/voz/servidor-microsoft";
import { falarNaVozPropria, vozPropriaConfigurada } from "@/lib/voz/servidor-proprio";

import type { MeditacaoDaSemana, TrechoDaMeditacao } from "./meditacao";

const VALIDADE_S = 3600;
const VOZ = "ms_francisca";
/** Mais devagar que a conversa: meditação pede calma. */
const VELOCIDADE = 0.86;

export function caminhoDaMeditacao(orgId: string, contactId: string, semana: string): string {
  return `${orgId}/meditacao/${contactId}/${semana}.mp3`;
}

export function haVozParaMeditar(): boolean {
  return vozMicrosoftConfigurada() || vozPropriaConfigurada();
}

/**
 * Um quadro MP3 mudo: MPEG-2 camada III, 24 kHz, 48 kbps, mono, sem CRC. 144 bytes = 576 amostras = 24 ms.
 * Cabeçalho FF F3 64 C0 e o resto zerado (informação lateral zerada decodifica como silêncio).
 */
const QUADRO_MUDO = (() => {
  const q = Buffer.alloc(144);
  q.set([0xff, 0xf3, 0x64, 0xc0], 0);
  return q;
})();
const MS_POR_QUADRO = 24;

export function silencio(segundos: number): Buffer {
  const n = Math.max(0, Math.round((segundos * 1000) / MS_POR_QUADRO));
  return Buffer.concat(Array.from({ length: n }, () => QUADRO_MUDO));
}

/** Tira uma etiqueta ID3 do começo, se houver: no meio do arquivo ela vira ruído em alguns tocadores. */
export function semId3(mp3: Buffer): Buffer {
  if (mp3.length < 10 || mp3.toString("latin1", 0, 3) !== "ID3") return mp3;
  const tamanho = ((mp3[6]! & 0x7f) << 21) | ((mp3[7]! & 0x7f) << 14) | ((mp3[8]! & 0x7f) << 7) | (mp3[9]! & 0x7f);
  return mp3.subarray(10 + tamanho);
}

/** Fala os trechos (3 de cada vez) e emenda com o silêncio de cada um. */
export async function narrarTrechos(
  trechos: TrechoDaMeditacao[],
  falar: (texto: string) => Promise<Buffer>,
): Promise<Buffer> {
  const falas: Buffer[] = new Array(trechos.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < trechos.length) {
      const i = proximo++;
      falas[i] = semId3(await falar(trechos[i]!.texto));
    }
  };
  await Promise.all([trabalhador(), trabalhador(), trabalhador()]);
  return Buffer.concat(trechos.flatMap((t, i) => [falas[i]!, silencio(t.pausa)]));
}

export type ResultadoDaMeditacao = { ok: true; url: string } | { ok: false; motivo: "sem_voz" | "falhou" };

export async function meditacaoFalada(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  m: MeditacaoDaSemana,
): Promise<ResultadoDaMeditacao> {
  if (!haVozParaMeditar()) return { ok: false, motivo: "sem_voz" };
  const caminho = caminhoDaMeditacao(orgId, contactId, m.semana);
  const storage = admin.storage.from(BUCKET_DAS_FOTOS);
  const pronta = await storage.createSignedUrl(caminho, VALIDADE_S);
  if (pronta.data?.signedUrl) return { ok: true, url: pronta.data.signedUrl };

  let audio: Buffer | null = null;
  if (vozMicrosoftConfigurada()) {
    try {
      audio = await narrarTrechos(m.trechos, (texto) => falarComVozDaMicrosoft(texto, VOZ, { velocidade: VELOCIDADE }));
    } catch (err) {
      logger.error("[area.meditacao] Francisca falhou — tenta a voz própria", {
        organization_id: orgId,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  if (!audio && vozPropriaConfigurada()) {
    try {
      audio = await falarNaVozPropria(m.trechos.map((t) => t.texto).join("\n\n"), { velocidade: VELOCIDADE });
    } catch (err) {
      logger.error("[area.meditacao] meditação não narrada", {
        organization_id: orgId,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  if (!audio) return { ok: false, motivo: "falhou" };

  const { error } = await storage.upload(caminho, audio, { contentType: "audio/mpeg", upsert: true });
  if (error) {
    logger.error("[area.meditacao] áudio não guardado", { organization_id: orgId, motivo: error.message.slice(0, 200) });
    return { ok: false, motivo: "falhou" };
  }
  const assinada = await storage.createSignedUrl(caminho, VALIDADE_S);
  return assinada.data?.signedUrl ? { ok: true, url: assinada.data.signedUrl } : { ok: false, motivo: "falhou" };
}
