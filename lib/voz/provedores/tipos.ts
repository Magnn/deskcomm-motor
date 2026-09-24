import type { AudioGerado, GeneroDaVoz, IdDeProvedorDeVoz, VoiceReplyConfig, VozDisponivel } from "../tipos";

/**
 * `nota_de_voz` = Ogg/Opus que o WhatsApp aceita (o que a agente envia).
 * `previa` = mp3, que TODO navegador toca (Safari não toca Ogg/Opus) — é o que
 * a tela usa para o operador ouvir a voz antes de escolher.
 */
export type FormatoDoAudio = "nota_de_voz" | "previa";

export interface PedidoDeSintese {
  apiKey: string;
  vozId: string;
  texto: string;
  formato: FormatoDoAudio;
  /** Só os ajustes de fala; o provedor ignora o que não é dele. */
  ajustes?: Partial<Pick<VoiceReplyConfig, "model" | "speed" | "stability" | "similarity_boost" | "style" | "style_instructions">>;
}

export interface AmostraDeVoz {
  nome: string;
  tipo: string;
  dados: Uint8Array;
}

export interface PedidoDeClonagem {
  apiKey: string;
  nome: string;
  genero: GeneroDaVoz;
  descricao?: string;
  amostras: AmostraDeVoz[];
}

/** Uma voz da BIBLIOTECA pública do provedor — ainda não está na conta de ninguém. */
export interface VozDaBiblioteca {
  /** Quem publicou a voz; junto do `id`, é o que o pedido de "adicionar" precisa. */
  publicOwnerId: string;
  id: string;
  nome: string;
  genero: GeneroDaVoz;
  /** Ex.: "brazilian". Vem do provedor; pode faltar. */
  sotaque?: string;
  /** Ex.: "pt-BR". */
  locale?: string;
  idade?: string;
  /** Ex.: "conversational", "narrative". */
  usoIndicado?: string;
  descricao?: string;
  previewUrl?: string;
}

export interface BuscaNaBiblioteca {
  /** ISO 639-1. Padrão: "pt". */
  idioma?: string;
  genero?: GeneroDaVoz;
  texto?: string;
}

export type ResultadoDaChave = { ok: true } | { ok: false; error: string };

export interface ImplementacaoDeVoz {
  id: IdDeProvedorDeVoz;
  listarVozes(apiKey: string): Promise<VozDisponivel[]>;
  sintetizar(pedido: PedidoDeSintese): Promise<AudioGerado>;
  validarChave(apiKey: string): Promise<ResultadoDaChave>;
  /** Só quem clona implementa. */
  clonar?(pedido: PedidoDeClonagem): Promise<VozDisponivel>;
  apagarVoz?(apiKey: string, vozId: string): Promise<void>;
  /** Só quem tem biblioteca pública implementa. */
  buscarNaBiblioteca?(apiKey: string, busca: BuscaNaBiblioteca): Promise<VozDaBiblioteca[]>;
  adicionarDaBiblioteca?(apiKey: string, pedido: { publicOwnerId: string; vozId: string; nome: string }): Promise<VozDisponivel>;
}
