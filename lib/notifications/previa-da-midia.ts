/**
 * O TEXTO DA NOTIFICAÇÃO DE UMA MENSAGEM COM MÍDIA — como o WhatsApp mostra: "🎤 Áudio", "📷 Foto", "📄 PDF".
 *
 * Pedido do dono em 21/10/2026: toda mídia chegava como "Mídia", e não dava para saber, pela notificação, se a
 * pessoa tinha mandado um áudio ou o comprovante do Pix. Agora o tipo vem escrito, com a legenda quando há, e a
 * imagem ou documento que chega depois de um Pix enviado na conversa é anunciado como possível comprovante.
 * Pura.
 */

export interface MidiaRecebida {
  /** `messages.type`: audio, image, video, document, sticker, location, contact, reaction… */
  tipo: string;
  /** `messages.media_mime`, quando houver. */
  mime?: string | null;
  /** A legenda (`messages.body` de uma mídia). */
  legenda?: string | null;
  /** A conversa recebeu um código Pix nosso nas últimas 24 h. */
  aguardandoPagamento?: boolean;
}

function rotuloDoDocumento(mime: string | null | undefined): string {
  const m = (mime ?? "").toLowerCase();
  if (m.includes("pdf")) return "📄 PDF";
  if (m.includes("word") || m.includes("msword")) return "📄 Documento do Word";
  if (m.includes("sheet") || m.includes("excel")) return "📄 Planilha";
  if (m.startsWith("image/")) return "📷 Foto";
  return "📄 Documento";
}

export function previaDaMidia(m: MidiaRecebida): string {
  const legenda = (m.legenda ?? "").trim();
  const comLegenda = (rotulo: string) => (legenda !== "" ? `${rotulo}: ${legenda}` : rotulo);
  let texto: string;
  switch (m.tipo) {
    case "audio":
    case "ptt":
    case "voice":
      texto = "🎤 Áudio";
      break;
    case "image":
      texto = comLegenda("📷 Foto");
      break;
    case "video":
      texto = comLegenda("🎥 Vídeo");
      break;
    case "document":
      texto = comLegenda(rotuloDoDocumento(m.mime));
      break;
    case "sticker":
      texto = "Figurinha";
      break;
    case "location":
      texto = "📍 Localização";
      break;
    case "contact":
    case "vcard":
      texto = "👤 Contato";
      break;
    case "reaction":
      texto = legenda !== "" ? `Reagiu com ${legenda}` : "Reagiu a uma mensagem";
      break;
    default:
      texto = comLegenda("📎 Arquivo");
  }
  const podeSerComprovante = m.tipo === "image" || m.tipo === "document";
  return m.aguardandoPagamento && podeSerComprovante ? `🧾 Possível comprovante · ${texto}` : texto;
}
