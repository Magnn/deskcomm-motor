import { z } from "zod";

export const mediaItemTypeSchema = z.enum(["image", "audio", "video", "document"]);
export type MediaItemType = z.infer<typeof mediaItemTypeSchema>;

export const mediaItemSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  name: z.string().min(1, "Nome do arquivo é obrigatório"),
  type: mediaItemTypeSchema,
  url: z.string().url("URL de mídia inválida"),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  durationSeconds: z.number().int().optional(),
  thumbnailUrl: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
  folder: z.string().default("geral"),
  createdAt: z.string().default(() => new Date().toISOString()),
});

export type MediaItem = z.infer<typeof mediaItemSchema>;

/**
 * Determina o tipo de mídia pelo MIME type do arquivo.
 */
export function detectMediaType(mimeType: string): MediaItemType {
  const cleanMime = mimeType.toLowerCase().trim();
  if (cleanMime.startsWith("image/")) return "image";
  if (cleanMime.startsWith("audio/")) return "audio";
  if (cleanMime.startsWith("video/")) return "video";
  return "document";
}

/**
 * Formata tamanho de bytes em formato legível para humanos (ex: 2.4 MB).
 */
export function formatMediaSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Filtra itens da biblioteca por tipo, pasta e busca textual.
 */
export function filterMediaLibrary(
  items: MediaItem[],
  filters: {
    type?: MediaItemType | "all";
    folder?: string | "all";
    search?: string;
  }
): MediaItem[] {
  return items.filter((item) => {
    if (filters.type && filters.type !== "all" && item.type !== filters.type) {
      return false;
    }
    if (filters.folder && filters.folder !== "all" && item.folder.toLowerCase() !== filters.folder.toLowerCase()) {
      return false;
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      const matchName = item.name.toLowerCase().includes(q);
      const matchTag = item.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchName && !matchTag) return false;
    }
    return true;
  });
}
