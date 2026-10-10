/**
 * Transcrição de áudio plugável (Onda 3). Default: API speech-to-text
 * OpenAI-compatível (Whisper) via BYOK. O derivado é texto → alimenta QUALQUER
 * modelo de chat (camada universal). Um backend mlx-whisper local implementa a
 * mesma interface para self-host em Apple Silicon (fora deste MVP).
 */
export interface TranscriptionProvider {
  transcribe(audio: Buffer, mime: string): Promise<string>;
}

export interface TranscriptionCreds {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** Quanto esperar a resposta. Ausente = sem teto (o comportamento de sempre). */
  timeoutMs?: number;
}

const DEFAULT_BASE = "https://api.openai.com";
const DEFAULT_MODEL = "whisper-1";

function extFor(mime: string): string {
  const base = mime.split(";")[0]!.trim().toLowerCase();
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  if (base.includes("mp4") || base.includes("m4a")) return "m4a";
  if (base.includes("webm")) return "webm";
  if (base.includes("wav")) return "wav";
  return "bin";
}

/**
 * O CÓDIGO que o provedor deu para a recusa, como sufixo `:codigo` — ou vazio.
 *
 * Só o status não diz o que fazer: na API OpenAI-compatível o 429 é tanto
 * "muitas chamadas" (`rate_limit_exceeded`, passa sozinho) quanto "conta sem
 * saldo" (`insufficient_quota`, só o dono resolve). Medido em produção
 * (05–06/10): 21 áudios de cliente mortos em dois dias com `transcription_429`
 * no aviso da Central, e nada ali dizia que a saída era pôr saldo na conta.
 *
 * Só o `code`/`type` atravessam, e só quando são um identificador simples: a
 * frase livre do provedor repete parte da chave no 401 ("Incorrect API key
 * provided: sk-…"), e este texto vai para log e para a Central.
 */
async function codigoDaRecusa(res: Response): Promise<string> {
  try {
    const corpo = (await res.json()) as { error?: { code?: unknown; type?: unknown } | null };
    const codigo = corpo?.error?.code ?? corpo?.error?.type;
    return typeof codigo === "string" && /^[a-z0-9_.-]{1,60}$/i.test(codigo) ? `:${codigo}` : "";
  } catch {
    return "";
  }
}

/**
 * A frase para quem opera, a partir do erro que `transcribe` lançou. `null`
 * quando o erro não é um dos que têm ação conhecida — aí vale o texto genérico
 * de quem avisa.
 */
export function motivoDaFalhaDeTranscricao(detalhe: string): string | null {
  if (!detalhe.startsWith("transcription_")) return null;
  if (/insufficient_quota|billing|credit/i.test(detalhe) || detalhe.startsWith("transcription_402")) {
    return "a conta do serviço de transcrição está sem saldo ou sem cota — o áudio só volta a ser lido depois de regularizar o pagamento no provedor dessa chave";
  }
  if (detalhe.startsWith("transcription_429")) {
    return "o serviço de transcrição recusou por limite de uso da conta (muitas chamadas ou cota esgotada)";
  }
  if (detalhe.startsWith("transcription_401") || detalhe.startsWith("transcription_403")) {
    return "o serviço de transcrição recusou a chave cadastrada";
  }
  return null;
}

export function apiTranscriptionProvider(
  creds: TranscriptionCreds,
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  const rawBase = (creds.baseUrl ?? DEFAULT_BASE).trim().replace(/\/+$/, "");
  const base = rawBase.replace(/\/v1$/, "");
  const model = creds.model ?? DEFAULT_MODEL;
  return {
    async transcribe(audio, mime) {
      const form = new FormData();
      form.append("model", model);
      form.append(
        "file",
        new Blob([new Uint8Array(audio)], { type: mime.split(";")[0]!.trim() }),
        `audio.${extFor(mime)}`,
      );
      const res = await fetchImpl(`${base}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${creds.apiKey}` },
        body: form,
        ...(creds.timeoutMs ? { signal: AbortSignal.timeout(creds.timeoutMs) } : {}),
      });
      if (!res.ok) throw new Error(`transcription_${res.status}${await codigoDaRecusa(res)}`);
      const json = (await res.json()) as { text?: string };
      return json.text ?? "";
    },
  };
}

// ─── A RESERVA ──────────────────────────────────────────────────────────────
//
// Medido em produção em 06–07/10/2026: a conta do serviço principal de transcrição ficou sem saldo e 28
// áudios de cliente ficaram sem leitura — a agente não "ouviu" nenhum. A organização tinha, ativa e
// validada, a chave do provedor de VOZ, que também transcreve. Uma recusa por conta (sem saldo, cota,
// chave) no serviço principal passa a cair para ele, em vez de deixar o áudio mudo.

const BASE_DA_RESERVA = "https://api.elevenlabs.io/v1";
const MODELO_DA_RESERVA = "scribe_v1";

/** Transcrição pelo provedor de voz (ElevenLabs, `POST /v1/speech-to-text`). */
export function elevenlabsTranscriptionProvider(
  creds: { apiKey: string; model?: string },
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  return {
    async transcribe(audio, mime) {
      const form = new FormData();
      form.append("model_id", creds.model ?? MODELO_DA_RESERVA);
      // Sem marcações de som ambiente — "(risos)", "(música)" — no texto que o agente vai ler como fala.
      form.append("tag_audio_events", "false");
      form.append(
        "file",
        new Blob([new Uint8Array(audio)], { type: mime.split(";")[0]!.trim() }),
        `audio.${extFor(mime)}`,
      );
      const res = await fetchImpl(`${BASE_DA_RESERVA}/speech-to-text`, {
        method: "POST",
        headers: { "xi-api-key": creds.apiKey },
        body: form,
      });
      // O mesmo prefixo do serviço principal, com `reserva` no código: o aviso da Central e o log sabem
      // dizer QUAL dos dois recusou. Só o status sai; o corpo de erro deste provedor é texto livre.
      if (!res.ok) throw new Error(`transcription_${res.status}:reserva`);
      const json = (await res.json()) as { text?: string };
      return json.text ?? "";
    },
  };
}

// ─── A SEGUNDA RESERVA ───────────────────────────────────────────────────
//
// Medido em produção em 10/10/2026: o serviço principal sem saldo E a reserva recusando parte dos
// áudios (401) — 232 de 796 áudios de cliente em 24 horas ficaram sem leitura, e a agente respondeu a
// todos sem saber o que a pessoa disse. A organização tinha uma terceira chave ativa, a do Google, cujo
// modelo ouve áudio. Duas contas zeradas no mesmo dia não podem deixar o atendimento surdo.

const BASE_DO_GOOGLE = "https://generativelanguage.googleapis.com/v1beta";
export const MODELO_PADRAO_DA_SEGUNDA_RESERVA = "gemini-3.5-flash";
const PEDIDO_DE_TRANSCRICAO =
  "Transcreva este áudio palavra por palavra, no idioma em que foi falado. Devolva SOMENTE a transcrição: sem comentário, sem resumo, sem marcação de tempo, sem descrever sons. Se não houver fala, devolva vazio.";

/** Transcrição por um modelo do Google que ouve áudio (`POST …/models/<modelo>:generateContent`). */
export function googleTranscriptionProvider(
  creds: { apiKey: string; model?: string },
  fetchImpl: typeof fetch = fetch,
): TranscriptionProvider {
  return {
    async transcribe(audio, mime) {
      const modelo = encodeURIComponent(creds.model ?? MODELO_PADRAO_DA_SEGUNDA_RESERVA);
      const res = await fetchImpl(`${BASE_DO_GOOGLE}/models/${modelo}:generateContent`, {
        method: "POST",
        // A chave vai no CABEÇALHO, nunca no endereço: endereço aparece em log de proxy.
        headers: { "x-goog-api-key": creds.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: PEDIDO_DE_TRANSCRICAO },
                { inline_data: { mime_type: mime.split(";")[0]!.trim(), data: Buffer.from(audio).toString("base64") } },
              ],
            },
          ],
          generationConfig: { temperature: 0 },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      // Mesmo prefixo dos outros dois, com `reserva2`: o log diz QUAL dos três recusou. Só o status sai.
      if (!res.ok) throw new Error(`transcription_${res.status}:reserva2`);
      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return (json.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("")
        .trim();
    },
  };
}

/**
 * A recusa foi da CONTA (sem saldo, cota, chave)? Só essas caem para a reserva: fora do ar, áudio
 * ilegível e tempo esgotado não melhoram trocando de provedor por causa da conta — e o caminho de
 * sempre (re-tentativa do dreno) já cuida deles.
 */
export function recusaDaConta(detalhe: string): boolean {
  return /^transcription_(401|402|403|429)\b/.test(detalhe);
}

/**
 * O SERVIÇO PRÓPRIO DA INSTALAÇÃO com o caminho padrão atrás dele.
 *
 * Quem aponta a transcrição para um serviço seu (`TRANSCRIPTION_BASE_URL` — um Whisper rodando na
 * própria máquina, por exemplo) não podia ficar SEM reserva nenhuma: até 10/10/2026 esse caminho
 * ignorava as chaves da organização, e o serviço próprio fora do ar era áudio sem leitura.
 *
 * Diferente de `comReserva`, aqui QUALQUER falha cai para o padrão — fora do ar, tempo esgotado,
 * erro interno. O serviço próprio não tem "conta" que recuse; quando ele falha, a causa é ele.
 */
export function comPadraoAtras(
  proprio: TranscriptionProvider,
  padrao: TranscriptionProvider,
  aoCair?: (motivo: string) => void,
): TranscriptionProvider {
  return {
    async transcribe(audio, mime) {
      try {
        return await proprio.transcribe(audio, mime);
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err);
        aoCair?.(detalhe.slice(0, 120));
        return padrao.transcribe(audio, mime);
      }
    },
  };
}

/**
 * O serviço principal com uma reserva. `reserva` devolve `null` quando não há chave para ela — aí vale o
 * erro do principal, que é o que diz ao dono o que regularizar.
 */
export function comReserva(
  principal: TranscriptionProvider,
  reserva: () => Promise<TranscriptionProvider | null>,
  aoUsarReserva?: (motivoDoPrincipal: string) => void,
): TranscriptionProvider {
  return {
    async transcribe(audio, mime) {
      try {
        return await principal.transcribe(audio, mime);
      } catch (err) {
        const detalhe = err instanceof Error ? err.message : String(err);
        if (!recusaDaConta(detalhe)) throw err;
        const outra = await reserva();
        if (outra === null) throw err;
        aoUsarReserva?.(detalhe);
        try {
          return await outra.transcribe(audio, mime);
        } catch (erroDaReserva) {
          // As duas recusaram. O erro que sobe COMEÇA pelo do principal: é ele que diz ao dono o que
          // regularizar (`motivoDaFalhaDeTranscricao` lê o começo), e o da reserva vai junto para o log.
          const daReserva = erroDaReserva instanceof Error ? erroDaReserva.message : String(erroDaReserva);
          throw new Error(`${detalhe} (reserva: ${daReserva})`);
        }
      }
    },
  };
}
