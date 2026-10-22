/**
 * A MÍDIA DA ÁREA: a foto da guia e os vídeos dos quizzes (migration 0946), num bucket PÚBLICO só disto,
 * `area-midia`. A configuração guarda o CAMINHO (`<organização>/<arquivo>`), nunca a URL: a URL é função do
 * caminho e do endereço do Storage desta instalação (`baseDoStorage`), e gravá-la amarraria a área ao host de hoje
 * — o mesmo motivo do logo (`lib/branding/logo.ts`).
 *
 * Pura.
 */
import { z } from "zod";

export const BUCKET_DA_MIDIA_DA_AREA = "area-midia";

/** `<uuid da organização>/<pastas>/<nome>.<jpg|jpeg|png|webp|mp4>` — sem `..`, sem barra no começo. */
export const caminhoDaMidiaSchema = z
  .string()
  .trim()
  .max(300)
  .regex(/^[0-9a-f-]{36}\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|mp4)$/, "caminho de mídia inválido")
  .refine((c) => !c.includes(".."), "caminho de mídia inválido");

/** A URL pública de um caminho, ou `null` sem caminho ou sem base (melhor não mostrar do que mostrar quebrado). */
export function urlDaMidiaDaArea(caminho: string | null | undefined, base: string): string | null {
  if (!caminho || !base) return null;
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET_DA_MIDIA_DA_AREA}/${caminho.replace(/^\/+/, "")}`;
}
