/**
 * "Isto é uma nota de voz que o WhatsApp aceita?" — a checagem, sem ffmpeg.
 *
 * O canal oficial só aceita `audio/ogg` com codec OPUS, e não converte: um
 * arquivo em outro container faz a Meta aceitar o envio e falhar depois com o
 * 131053 (ver `lib/messaging/media/voice-transcode.ts`). Os dois provedores
 * devolvem Ogg/Opus direto quando pedimos o formato certo, mas "quando pedimos
 * o formato certo" é uma promessa do provedor — esta função é o que confere
 * antes de o arquivo ir para o Storage.
 *
 * Um Ogg começa com a assinatura `OggS`, e o primeiro pacote de um stream Opus
 * começa com `OpusHead`, dentro dos primeiros bytes.
 */
export function ehOggOpus(buffer: Buffer): boolean {
  if (buffer.length < 36) return false;
  if (buffer.toString("latin1", 0, 4) !== "OggS") return false;
  return buffer.subarray(0, 96).includes("OpusHead", 0, "latin1");
}
