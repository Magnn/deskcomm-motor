/**
 * OUVIR A LEITURA — qualquer leitura escrita da área (quiz, sinastria, mão) narrada pela voz do próprio servidor.
 * Pedido dos comentários das lojas (02/11/2026): "queria ouvir a leitura". A Mesa já tinha a sua narração
 * (`leituras-voz.ts`); esta serve às leituras longas, de até 16 mil caracteres.
 *
 * O texto vira trechos por parágrafo (até ~1.200 caracteres cada), falados pela Francisca e emendados com uma
 * pausa curta (`meditacao-voz.ts`). Sem a Francisca, o Kokoro fala em blocos de até 5.000 caracteres. O mp3 é
 * gerado uma vez e guardado no Storage, no caminho que quem chama decide.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { BUCKET_DAS_FOTOS } from "@/lib/catalogo/fotos";
import { logger } from "@/lib/logger";
import { falarComVozDaMicrosoft, vozMicrosoftConfigurada } from "@/lib/voz/servidor-microsoft";
import { falarNaVozPropria, vozPropriaConfigurada } from "@/lib/voz/servidor-proprio";

import { narrarTrechos, semId3 } from "./meditacao-voz";

const VALIDADE_S = 3600;
const PAUSA_ENTRE_PARAGRAFOS = 0.7;

export function haVozParaNarrar(): boolean {
  return vozMicrosoftConfigurada() || vozPropriaConfigurada();
}

/** Tira o que não se fala: marcação de markdown, emoji, linhas de separação. */
export function textoParaFala(texto: string): string {
  return texto
    .replace(/\p{Extended_Pictographic}|️/gu, "")
    .replace(/^[-–—_*=]{3,}\s*$/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[ 	]*[-*•][ 	]+/gm, "")
    .replace(/[*_`~>]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parte o texto em trechos de até `max` caracteres, respeitando parágrafos e, se preciso, frases. */
export function trechosParaFala(texto: string, max = 1200): string[] {
  const saida: string[] = [];
  for (const paragrafo of textoParaFala(texto).split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean)) {
    if (paragrafo.length <= max) {
      saida.push(paragrafo);
      continue;
    }
    let atual = "";
    for (const frase of paragrafo.split(/(?<=[.!?…])\s+/)) {
      if (atual && (atual + " " + frase).length > max) {
        saida.push(atual);
        atual = frase;
      } else atual = atual ? `${atual} ${frase}` : frase;
    }
    if (atual) saida.push(atual.slice(0, max * 2));
  }
  return saida;
}

export type ResultadoDaNarracaoLonga = { ok: true; url: string } | { ok: false; motivo: "sem_voz" | "falhou" };

export async function narrarTextoLongo(
  admin: SupabaseClient,
  orgId: string,
  caminho: string,
  texto: string,
): Promise<ResultadoDaNarracaoLonga> {
  if (!haVozParaNarrar()) return { ok: false, motivo: "sem_voz" };
  const storage = admin.storage.from(BUCKET_DAS_FOTOS);
  const pronta = await storage.createSignedUrl(caminho, VALIDADE_S);
  if (pronta.data?.signedUrl) return { ok: true, url: pronta.data.signedUrl };

  let audio: Buffer | null = null;
  if (vozMicrosoftConfigurada()) {
    try {
      const trechos = trechosParaFala(texto).map((t) => ({ texto: t, pausa: PAUSA_ENTRE_PARAGRAFOS }));
      audio = await narrarTrechos(trechos, (t) => falarComVozDaMicrosoft(t, "ms_francisca", { velocidade: 0.95 }));
    } catch (err) {
      logger.error("[area.narracao] Francisca falhou — tenta a voz própria", {
        organization_id: orgId,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  if (!audio && vozPropriaConfigurada()) {
    try {
      const partes: Buffer[] = [];
      for (const bloco of trechosParaFala(texto, 5000)) partes.push(semId3(await falarNaVozPropria(bloco, { velocidade: 0.95 })));
      audio = Buffer.concat(partes);
    } catch (err) {
      logger.error("[area.narracao] leitura não narrada", {
        organization_id: orgId,
        motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
      });
    }
  }
  if (!audio) return { ok: false, motivo: "falhou" };

  const { error } = await storage.upload(caminho, audio, { contentType: "audio/mpeg", upsert: true });
  if (error) {
    logger.error("[area.narracao] áudio não guardado", { organization_id: orgId, motivo: error.message.slice(0, 200) });
    return { ok: false, motivo: "falhou" };
  }
  const assinada = await storage.createSignedUrl(caminho, VALIDADE_S);
  return assinada.data?.signedUrl ? { ok: true, url: assinada.data.signedUrl } : { ok: false, motivo: "falhou" };
}
