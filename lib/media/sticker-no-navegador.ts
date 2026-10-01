/**
 * Prepara um sticker do WhatsApp NO NAVEGADOR, antes do upload.
 *
 * O WhatsApp só aceita sticker em `.webp`, 512×512, e pequeno (100 KB o
 * estático, 500 KB o animado). Quem monta um fluxo tem um PNG ou um JPG na mão,
 * não um `.webp` nessas medidas. Em vez de pedir que a pessoa converta fora, o
 * navegador converte: desenha a imagem num canvas 512×512 (inteira, centrada,
 * fundo transparente) e exporta em WebP, baixando a qualidade até caber.
 *
 * Por que aqui e não no servidor: o projeto não tem biblioteca de imagem
 * instalada como dependência direta, e trazê-la para a imagem Docker é um peso
 * que este recurso não justifica. O canvas do navegador já faz o trabalho.
 *
 * `.webp` que JÁ cabe passa intacto — inclusive o animado, que um canvas
 * achataria num quadro só.
 */

/** O que a pessoa pode escolher no seletor de arquivo. */
export const STICKER_FORMATOS_DE_ENTRADA = ["image/webp", "image/png", "image/jpeg"] as const;
/** Teto do ARQUIVO DE ORIGEM (a saída é sempre muito menor). */
export const STICKER_ORIGEM_MAX_BYTES = 2 * 1024 * 1024;
/** Teto do sticker ESTÁTICO convertido — o limite do WhatsApp. */
export const STICKER_ESTATICO_MAX_BYTES = 100 * 1024;
const LADO = 512;

export type StickerPreparado =
  | { ok: true; arquivo: File }
  | { ok: false; motivo: "formato" | "grande_demais" | "navegador_sem_webp" | "nao_coube" | "imagem_invalida" };

function trocarExtensao(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return `${ponto > 0 ? nome.slice(0, ponto) : nome}.webp`;
}

/** A parte pura da decisão — testável sem canvas. */
export function precisaConverter(tipo: string, bytes: number, tetoDoWebpPronto: number): boolean {
  return !(tipo === "image/webp" && bytes <= tetoDoWebpPronto);
}

/**
 * @param tetoDoWebpPronto teto de bytes de um `.webp` que entra sem conversão
 *   (o da rota de upload — 500 KB, que cobre o sticker animado).
 */
export async function prepararSticker(arquivo: File, tetoDoWebpPronto: number): Promise<StickerPreparado> {
  if (!(STICKER_FORMATOS_DE_ENTRADA as readonly string[]).includes(arquivo.type)) {
    return { ok: false, motivo: "formato" };
  }
  if (!precisaConverter(arquivo.type, arquivo.size, tetoDoWebpPronto)) {
    return { ok: true, arquivo };
  }
  if (arquivo.size > STICKER_ORIGEM_MAX_BYTES) return { ok: false, motivo: "grande_demais" };

  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(arquivo);
  } catch {
    return { ok: false, motivo: "imagem_invalida" };
  }

  const canvas = document.createElement("canvas");
  canvas.width = LADO;
  canvas.height = LADO;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, motivo: "navegador_sem_webp" };
  // Inteira e centrada: sticker cortado perde justamente a borda do desenho.
  const escala = Math.min(LADO / imagem.width, LADO / imagem.height);
  const largura = Math.round(imagem.width * escala);
  const altura = Math.round(imagem.height * escala);
  ctx.clearRect(0, 0, LADO, LADO);
  ctx.drawImage(imagem, Math.round((LADO - largura) / 2), Math.round((LADO - altura) / 2), largura, altura);
  imagem.close();

  for (const qualidade of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", qualidade));
    // Navegador que não sabe exportar WebP devolve PNG em silêncio.
    if (!blob || blob.type !== "image/webp") return { ok: false, motivo: "navegador_sem_webp" };
    if (blob.size <= STICKER_ESTATICO_MAX_BYTES) {
      return { ok: true, arquivo: new File([blob], trocarExtensao(arquivo.name), { type: "image/webp" }) };
    }
  }
  return { ok: false, motivo: "nao_coube" };
}
