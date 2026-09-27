/**
 * Validação do upload outbound (Onda 2 + fix de teto por tipo).
 *
 * ─── Por que não é mais UM cap de 50MB pra tudo ────────────────────────────
 * A Meta recusa no envio de verdade bem antes dos 50MB do bucket: imagem
 * acima de 5MB, vídeo ou áudio acima de 16MB. Deixar o upload aceitar até
 * 50MB significava que o dono conseguia anexar uma imagem de 8MB no composer
 * (ou num item do nó Conteúdo) e só descobrir que a Meta recusou na hora do
 * envio de verdade — tarde demais para corrigir sem reabrir a composição.
 *
 * Documento é exceção pro OUTRO lado: a Meta aceita até 100MB, mas o bucket
 * `whatsapp-media` nasce com teto de 50MB (migration 0055) — e numa
 * instalação self-host a cota de Storage inteira é 1GB (`docs/doctrine`), um
 * documento sozinho não pode comer 10% dela. O teto que vale de verdade é o
 * menor dos dois: `MAX_MEDIA_BYTES`.
 */
import { MAX_MEDIA_BYTES } from "@/lib/messaging/media/types";

export type MessageKind = "image" | "video" | "audio" | "document";

/**
 * Posse do objeto no bucket: o path DEVE estar sob {org}/{conversation}/
 * (chaves do Storage são literais — sem semântica de traversal).
 *
 * Morava dentro do módulo de transporte do provider legado e não tinha nada a
 * ver com o canal: valida um path do NOSSO Storage, antes de qualquer coisa
 * tocar um provider. Ficar lá obrigava o handler de envio a importar do módulo
 * do provider — o acoplamento que o invariante 1 de
 * `docs/doctrine/restricao-de-canal.md` proíbe.
 */
export function isMediaPathOwnedBy(path: string, orgId: string, conversationId: string): boolean {
  return path.startsWith(`${orgId}/${conversationId}/`);
}

const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
]);

const IMAGE_MIMES = new Set(["image/jpeg", "image/png"]);
const VIDEO_MIMES = new Set(["video/mp4", "video/3gpp"]);
const AUDIO_MIMES = new Set([
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/amr",
  "audio/ogg",
  // Formato INTERMEDIÁRIO, não um formato que a Meta aceita: é o que o browser
  // grava (`MediaRecorder` não sabe gravar ogg), e `transcodificarNotaDeVoz`
  // converte para `audio/ogg;codecs=opus` ANTES do envio de verdade — depois
  // desta validação, no mesmo handler. Recusar aqui quebraria toda nota de voz
  // gravada no navegador. Ver `lib/messaging/media/voice-transcode.ts`.
  "audio/webm",
]);

/** Bytes e formato aceitos por tipo — a Meta recusa no envio de verdade bem antes do teto do bucket. */
const LIMITES_POR_TIPO: Record<MessageKind, { maxBytes: number; mimes: ReadonlySet<string> }> = {
  image: { maxBytes: 5 * 1024 * 1024, mimes: IMAGE_MIMES },
  video: { maxBytes: 16 * 1024 * 1024, mimes: VIDEO_MIMES },
  audio: { maxBytes: 16 * 1024 * 1024, mimes: AUDIO_MIMES },
  // Meta aceita até 100MB; o bucket (e a cota de Storage do self-host) não. Ver o cabeçalho do arquivo.
  document: { maxBytes: MAX_MEDIA_BYTES, mimes: DOCUMENT_MIMES },
};

function tipoDoMime(base: string): MessageKind | null {
  for (const [tipo, limite] of Object.entries(LIMITES_POR_TIPO) as [MessageKind, (typeof LIMITES_POR_TIPO)[MessageKind]][]) {
    if (limite.mimes.has(base)) return tipo;
  }
  return null;
}

type Ok = { ok: true; kind: MessageKind };
type Fail = { ok: false; code: "unsupported_media_type" | "payload_too_large" | "validation_failed"; message: string };

export function validateOutboundMedia(mime: string, sizeBytes: number): Ok | Fail {
  if (!sizeBytes || sizeBytes <= 0) {
    return { ok: false, code: "validation_failed", message: "Arquivo vazio." };
  }
  const base = mime.split(";")[0]!.trim().toLowerCase();
  const tipo = tipoDoMime(base);
  if (tipo === null) {
    return { ok: false, code: "unsupported_media_type", message: "Tipo de arquivo não suportado." };
  }
  const { maxBytes } = LIMITES_POR_TIPO[tipo];
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      code: "payload_too_large",
      message: `Arquivo acima de ${Math.round(maxBytes / (1024 * 1024))}MB (limite da Meta para ${tipo}).`,
    };
  }
  return { ok: true, kind: tipo };
}
