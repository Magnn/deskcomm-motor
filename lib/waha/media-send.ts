/**
 * Plano de envio de mídia WAHA por tipo de mensagem (Onda 2). Puro — o
 * WahaClient executa. sendVoice: WhatsApp só aceita OGG/OPUS; convert:true
 * pede conversão ao WAHA (contingência NOWEB Core registrada no plano).
 */
export interface OutboundMedia {
  url: string;
  mime: string;
  filename?: string | null;
  caption?: string | null;
  /**
   * Só para `kind: "audio"`: `true` = mandar como ARQUIVO de áudio, e não como
   * nota de voz. Ausente = nota de voz, que é o que todo áudio sempre foi.
   */
  asFile?: boolean;
}

export interface WahaSendPlan {
  endpoint: "sendImage" | "sendVideo" | "sendVoice" | "sendFile";
  payload: Record<string, unknown>;
}

export function wahaSendPlanFor(kind: string, media: OutboundMedia): WahaSendPlan {
  const file: Record<string, unknown> = { url: media.url, mimetype: media.mime };
  if (media.filename) file.filename = media.filename;

  switch (kind) {
    case "image":
      return { endpoint: "sendImage", payload: { file, ...(media.caption ? { caption: media.caption } : {}) } };
    case "video":
      return {
        endpoint: "sendVideo",
        payload: { file, convert: true, ...(media.caption ? { caption: media.caption } : {}) },
      };
    case "audio":
      // Arquivo de áudio: `sendFile`, sem conversão — chega como anexo com nome.
      if (media.asFile) return { endpoint: "sendFile", payload: { file } };
      return { endpoint: "sendVoice", payload: { file, convert: true } };
    case "sticker":
      // Este transporte não tem endpoint de figurinha. O .webp sai por
      // `sendImage`, SEM legenda: chega como imagem, não como anexo de arquivo
      // (que é o que o `default` faria). Figurinha de verdade só no canal oficial.
      return { endpoint: "sendImage", payload: { file } };
    default:
      return { endpoint: "sendFile", payload: { file, ...(media.caption ? { caption: media.caption } : {}) } };
  }
}
