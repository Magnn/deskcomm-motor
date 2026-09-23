/**
 * TEXTO → NOTA(S) DE VOZ, com a config de um agente.
 *
 * Duas decisões moram aqui:
 *
 *  1. QUANTAS notas. A resposta da agente sai como UMA nota de voz por até
 *     `max_chars_per_note` caracteres, cortando em fim de frase. Uma nota por
 *     bolha de texto (200 caracteres) viraria uma rajada de áudios de 8
 *     segundos, e nota longa demais ninguém ouve — o meio-termo é configurável.
 *  2. O que fazer com texto que não se fala. Emoji, asterisco de negrito e URL
 *     lida letra por letra estragam a voz; `textoParaFala` limpa antes de
 *     sintetizar. O TEXTO original segue como legenda da mensagem no inbox.
 */
import type { PedidoDeSintese } from "./provedores/tipos";
import { implementacaoDeVoz } from "./provedores";
import type { AudioGerado, IdDeProvedorDeVoz, VoiceReplyConfig } from "./tipos";

/** Emoji e pictogramas: a voz os lê como "rosto sorrindo" ou os engole. */
const EMOJI = /[\p{Extended_Pictographic}‍️]/gu;

export function textoParaFala(texto: string): string {
  return texto
    .replace(/https?:\/\/\S+/g, "") // link não se fala
    .replace(EMOJI, "")
    .replace(/[*_~`]+/g, "") // marcação do WhatsApp
    .replace(/([.!?…])[ \t]*\n+[ \t]*/g, "$1 ") // já havia pontuação: só junta
    .replace(/[ \t]*\n+[ \t]*/g, ". ") // sem pontuação: a quebra vira pausa
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Parte o texto em pedaços de até `max` caracteres, preferindo cortar depois de
 * fim de frase e, na falta dele, num espaço. Nunca devolve pedaço vazio.
 */
export function dividirEmNotas(texto: string, max: number): string[] {
  const limpo = texto.trim();
  if (limpo === "") return [];
  if (limpo.length <= max) return [limpo];

  const notas: string[] = [];
  let resto = limpo;
  while (resto.length > max) {
    const janela = resto.slice(0, max);
    let corte = Math.max(janela.lastIndexOf(". "), janela.lastIndexOf("? "), janela.lastIndexOf("! "), janela.lastIndexOf("… "));
    if (corte < max * 0.4) corte = janela.lastIndexOf(" "); // frase longa demais: corta no espaço
    if (corte <= 0) corte = max - 1; // palavra gigante: corta no seco
    notas.push(resto.slice(0, corte + 1).trim());
    resto = resto.slice(corte + 1).trim();
  }
  if (resto !== "") notas.push(resto);
  return notas.filter((n) => n !== "");
}

export interface PedidoDeNota {
  provedor: IdDeProvedorDeVoz;
  apiKey: string;
  config: Pick<VoiceReplyConfig, "voice_id" | "model" | "speed" | "stability" | "similarity_boost" | "style_instructions">;
  /** Já limpo por `textoParaFala`. */
  texto: string;
  formato?: PedidoDeSintese["formato"];
}

export function sintetizarNota(p: PedidoDeNota): Promise<AudioGerado> {
  return implementacaoDeVoz(p.provedor).sintetizar({
    apiKey: p.apiKey,
    vozId: p.config.voice_id,
    texto: p.texto,
    formato: p.formato ?? "nota_de_voz",
    ajustes: {
      ...(p.config.model !== undefined ? { model: p.config.model } : {}),
      ...(p.config.speed !== undefined ? { speed: p.config.speed } : {}),
      ...(p.config.stability !== undefined ? { stability: p.config.stability } : {}),
      ...(p.config.similarity_boost !== undefined ? { similarity_boost: p.config.similarity_boost } : {}),
      ...(p.config.style_instructions !== undefined ? { style_instructions: p.config.style_instructions } : {}),
    },
  });
}
