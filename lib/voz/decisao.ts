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
  /**
   * Modo `on_request`: quantos áudios a agente já mandou desde a última vez que a pessoa PEDIU áudio, ou `null`
   * se ela nunca pediu. Quem lê a conversa é `audiosDesdeOPedido` (`agent/nota-de-voz.ts`).
   */
  audiosDesdeOPedido?: number | null;
}

/** Quantos áudios a agente manda depois de um pedido, antes de voltar ao texto. Um pedido novo abre outros. */
export const AUDIOS_POR_PEDIDO = 3;

/**
 * A pessoa PEDIU para ser respondida em áudio. Vale para a mensagem escrita e para a transcrição do áudio dela.
 * Mandar um áudio não é pedir um: muita gente fala por preguiça de digitar e lê a resposta sem problema.
 */
const PEDIU_AUDIO =
  /(?<![\p{L}])(manda|mande|mandar|envia|envie|enviar|fala|fale|falar|grava|grave|gravar|responde|responda|responder|explica|explique|explicar|prefiro|quero|queria)(?![\p{L}])[^.?!\n]{0,40}(áudio|audio|(?<![\p{L}])voz(?![\p{L}]))|(?<![\p{L}])(por|em|no)\s+[áa]udio(?![\p{L}])|n[ãa]o\s+sei\s+ler|n[ãa]o\s+(consigo|enxergo)[^.?!\n]{0,20}(?<![\p{L}])ler(?![\p{L}])/iu;

export function pediuAudio(texto: string | null | undefined): boolean {
  return PEDIU_AUDIO.test(texto ?? "");
}

export function deveResponderEmAudio(
  config: Pick<VoiceReplyConfig, "mode" | "min_chars_for_voice">,
  { pessoaMandouAudio, texto, audiosDesdeOPedido }: EntradaDaDecisao,
): boolean {
  // Só a pedido: a voz custa e nem todo mundo quer ouvir. Depois de AUDIOS_POR_PEDIDO respostas, volta ao texto.
  if (config.mode === "on_request") {
    return audiosDesdeOPedido !== null && audiosDesdeOPedido !== undefined && audiosDesdeOPedido < AUDIOS_POR_PEDIDO;
  }
  // Conta a FALA, não o texto: link e emoji não se falam, então uma resposta de 300
  // caracteres que é quase só o link de pagamento não é "um momento" para voz.
  const longa = () => textoParaFala(texto).length >= config.min_chars_for_voice;
  // Espelho só nas longas: a pessoa falou, e a agente só fala de volta quando tem o que explicar.
  if (config.mode === "mirror_long") return pessoaMandouAudio && longa();
  if (pessoaMandouAudio) return true; // o espelho vale em `mirror` e em `moments`
  if (config.mode !== "moments") return false;
  return longa();
}
