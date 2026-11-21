/**
 * Mensagem que o WhatsApp oficial RECUSA entregar à API (erro 131060, tipo `unsupported`).
 *
 * O conteúdo nunca chega: a Meta manda só o aviso. Acontece com visualização única, enquete,
 * evento, figurinha de pacote novo e mensagem automática de conta de sistema (ex.: o remetente
 * de códigos do Facebook). Antes gravávamos o literal "[Unsupported message]" — o operador não
 * entendia e o agente respondia "não abriu pra mim" sem dizer o que fazer.
 */
export const TEXTO_MENSAGEM_INDISPONIVEL =
  "[Mensagem que o WhatsApp não repassa ao sistema: visualização única, enquete, evento ou aviso automático. " +
  "O conteúdo não chega por aqui; peça para a pessoa reenviar como mensagem comum (texto, foto ou áudio normal).]";

/** O literal que a Zernio põe no `text` quando a Meta recusa o conteúdo. */
export function ehMensagemIndisponivel(texto: string | null, temAvisoUnsupported: boolean): boolean {
  return temAvisoUnsupported || texto === "[Unsupported message]";
}
