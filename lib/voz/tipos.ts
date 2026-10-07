/**
 * VOZ DA AGENTE NO WHATSAPP — os tipos e o contrato da configuração.
 *
 * O que este módulo entrega: a agente responde com NOTA DE VOZ (a bolha com a
 * onda, não um anexo de música) quando a pessoa mandou áudio. A voz vem de um
 * provedor de síntese (OpenAI ou ElevenLabs); a ElevenLabs também clona uma voz
 * a partir de amostras de áudio.
 *
 * ─── Onde a configuração mora ───────────────────────────────────────────────
 * Em `ai_agents.config.voice_reply` (jsonb), o MESMO lugar dos knobs de RAG
 * (`rag_top_k`) e da voz das ligações. É configuração do AGENTE, não da versão
 * do prompt: ligar ou trocar a voz vale no próximo turno, sem publicar versão
 * nova — e sem coluna nova, então quem já instalou não precisa de migration.
 *
 * ─── Por que NÃO é um provedor de LLM ───────────────────────────────────────
 * `lib/ai/pontos/provedores.ts` é a lista de quem CONVERSA, e o teste
 * `provedores-x-registry` casa essa lista com o registry de modelos. A
 * ElevenLabs não conversa: entra aqui, numa lista própria, e reaproveita só a
 * mesma tabela de chaves cifradas (`ai_provider_credentials`, vocabulário
 * aberto desde a 0127).
 */
import { z } from "zod";

import { ehProvedorSuportado } from "@/lib/ai/pontos/provedores";

export interface ProvedorDeVoz {
  id: "openai" | "elevenlabs";
  rotulo: string;
  /** Uma frase sobre quando escolher, para quem não acompanha o mercado. */
  quandoUsar: string;
  /** O provedor sabe criar uma voz a partir de amostras? */
  clona: boolean;
  /** Onde a pessoa pega a chave — a tela mostra o link. */
  ondePegarAChave: string;
  /** Como a chave começa — vira placeholder do campo. */
  prefixoDaChave: string;
}

export const PROVEDORES_DE_VOZ = [
  {
    id: "openai",
    rotulo: "OpenAI",
    quandoUsar:
      "Usa a mesma chave que já transcreve os áudios que a pessoa manda. Vozes prontas, femininas e masculinas, sem clonagem.",
    clona: false,
    ondePegarAChave: "https://platform.openai.com/api-keys",
    prefixoDaChave: "sk-…",
  },
  {
    id: "elevenlabs",
    rotulo: "ElevenLabs",
    quandoUsar:
      "Vozes mais expressivas e clonagem: você envia uma gravação da voz e a agente passa a falar com ela. A clonagem exige um plano pago da ElevenLabs.",
    clona: true,
    ondePegarAChave: "https://elevenlabs.io/app/settings/api-keys",
    prefixoDaChave: "sk_…",
  },
] as const satisfies readonly ProvedorDeVoz[];

export type IdDeProvedorDeVoz = (typeof PROVEDORES_DE_VOZ)[number]["id"];

/**
 * Os provedores de voz cuja chave NÃO é também chave de conversa (hoje, a ElevenLabs). É o que a
 * tela de Credenciais precisa SOMAR à lista dela: a OpenAI já está lá como provedor de conversa, e
 * somar a lista de voz inteira a mostraria duas vezes. Enquanto a tela não somava nada, a rota
 * aceitava a chave da ElevenLabs e a tela não a oferecia nem a listava depois de cadastrada.
 */
export const PROVEDORES_SO_DE_VOZ = PROVEDORES_DE_VOZ.filter((p) => !ehProvedorSuportado(p.id));

export const IDS_DE_PROVEDOR_DE_VOZ = PROVEDORES_DE_VOZ.map((p) => p.id) as unknown as readonly [
  IdDeProvedorDeVoz,
  ...IdDeProvedorDeVoz[],
];

export function ehProvedorDeVoz(id: string): id is IdDeProvedorDeVoz {
  return (IDS_DE_PROVEDOR_DE_VOZ as readonly string[]).includes(id);
}

export type GeneroDaVoz = "feminina" | "masculina" | "neutra";

/** Uma voz que a pessoa pode escolher na tela. */
export interface VozDisponivel {
  provedor: IdDeProvedorDeVoz;
  /** O id da voz NO provedor — é o que vai na chamada de síntese. */
  id: string;
  nome: string;
  genero: GeneroDaVoz;
  /** `clonada` = criada aqui a partir de amostras; `pronta` = do catálogo do provedor. */
  categoria: "pronta" | "clonada";
  descricao?: string;
  /** Amostra que o navegador toca sem gastar síntese, quando o provedor fornece. */
  previewUrl?: string;
}

/** O áudio pronto para virar nota de voz. */
export interface AudioGerado {
  buffer: Buffer;
  /** `audio/ogg;codecs=opus` para nota de voz; `audio/mpeg` só na pré-escuta. */
  mime: string;
}

/**
 * O que o WhatsApp aceita como nota de voz — a MESMA string que o resto do
 * produto usa (`lib/messaging/media/voice-transcode.ts`). O `codecs=opus` não
 * é enfeite: a Meta recusa `audio/ogg` puro com o erro 131053.
 */
export const MIME_DA_NOTA_DE_VOZ = "audio/ogg;codecs=opus";

/**
 * A configuração de resposta em áudio de UM agente (`ai_agents.config.voice_reply`).
 *
 * Chaves em snake_case, como o resto do `config`. Dois modos:
 *  - `mirror`: responde em áudio quando a pessoa mandou áudio.
 *  - `moments`: o espelho MAIS as respostas longas (`min_chars_for_voice`) — o
 *    trecho em que a agente explica algo (uma leitura, uma orientação) sai falado
 *    mesmo que a pessoa esteja escrevendo. A decisão é determinística, pelo
 *    tamanho: nenhum marcador no prompt, então não há como um "[voz]" vazar para
 *    a pessoa.
 */
export const voiceReplySchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(["mirror", "moments"]).default("mirror"),
  /** Só vale em `moments`: a fala (sem link e emoji) precisa ter pelo menos isto. */
  min_chars_for_voice: z.number().int().min(80).max(1500).default(240),
  provider: z.enum(IDS_DE_PROVEDOR_DE_VOZ),
  voice_id: z.string().trim().min(1).max(120),
  /** Só para a tela mostrar o nome sem consultar o provedor. */
  voice_name: z.string().trim().max(120).optional(),
  /** Modelo de síntese. Vazio = o padrão do provedor. */
  model: z.string().trim().max(80).optional(),
  /** 0.7–1.2: faixa que as duas APIs aceitam. */
  speed: z.number().min(0.7).max(1.2).optional(),
  /** ElevenLabs: 0 = mais expressiva, 1 = mais estável. */
  stability: z.number().min(0).max(1).optional(),
  /** ElevenLabs: o quanto ela se agarra à voz original. */
  similarity_boost: z.number().min(0).max(1).optional(),
  /** ElevenLabs: exagero de estilo/emoção. 0 = neutra; acima de ~0.5 pode ficar teatral. */
  style: z.number().min(0).max(1).optional(),
  /** OpenAI: como falar ("voz calma e acolhedora, ritmo lento"). */
  style_instructions: z.string().trim().max(400).optional(),
  /** Acima disto o texto vira mais de uma nota — nota longa demais ninguém ouve. */
  max_chars_per_note: z.number().int().min(100).max(1500).default(700),
});
export type VoiceReplyConfig = z.infer<typeof voiceReplySchema>;

/**
 * Lê `config.voice_reply` de um jsonb solto SEM lançar.
 *
 * O `config` é jsonb livre: uma linha com shape estranho (edição manual, versão
 * futura) vira "desligado", nunca um turno derrubado. A direção segura é
 * continuar respondendo em texto.
 */
export function lerVoiceReply(config: unknown): VoiceReplyConfig | null {
  if (config === null || typeof config !== "object") return null;
  const bruto = (config as Record<string, unknown>).voice_reply;
  if (bruto === undefined || bruto === null) return null;
  const r = voiceReplySchema.safeParse(bruto);
  if (!r.success || !r.data.enabled) return null;
  return r.data;
}
