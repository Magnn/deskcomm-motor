/**
 * SE a resposta deste turno sai em áudio — a decisão, sem efeito colateral.
 *
 * Fica fora de `nota-de-voz.ts` (que fala com storage e provedor) para poder ser
 * testada com dois números e um texto. O turno chama isto por mensagem: a mesma
 * resposta pode sair falada num turno e escrita no outro, e qualquer falha da voz
 * continua caindo para texto depois desta decisão.
 */
import { textoParaFala } from "./sintetizar";
import type { VoiceReplyConfig } from "./tipos";

export interface EntradaDaDecisao {
  /** A mensagem que abriu o turno é um áudio da pessoa. */
  pessoaMandouAudio: boolean;
  /** A resposta que a agente vai enviar (ainda com link, emoji e marcação). */
  texto: string;
}

export function deveResponderEmAudio(
  config: Pick<VoiceReplyConfig, "mode" | "min_chars_for_voice">,
  { pessoaMandouAudio, texto }: EntradaDaDecisao,
): boolean {
  if (pessoaMandouAudio) return true; // o espelho vale nos dois modos
  if (config.mode !== "moments") return false;
  // Conta a FALA, não o texto: link e emoji não se falam, então uma resposta de 300
  // caracteres que é quase só o link de pagamento não é "um momento" para voz.
  return textoParaFala(texto).length >= config.min_chars_for_voice;
}
