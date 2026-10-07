/**
 * A reserva da transcrição: quando a conta do serviço principal recusa (sem saldo, cota, chave), o áudio
 * é transcrito pelo provedor de voz da organização, em vez de ficar mudo.
 */
import { describe, expect, it, vi } from "vitest";

import {
  comReserva,
  elevenlabsTranscriptionProvider,
  motivoDaFalhaDeTranscricao,
  recusaDaConta,
  type TranscriptionProvider,
} from "@/lib/messaging/media/transcription";

const audio = Buffer.from([1, 2, 3]);
const que = (texto: string): TranscriptionProvider => ({ transcribe: vi.fn(async () => texto) });
const queFalha = (mensagem: string): TranscriptionProvider => ({
  transcribe: vi.fn(async () => {
    throw new Error(mensagem);
  }),
});

describe("recusaDaConta", () => {
  it("sem saldo, cota e chave recusada caem para a reserva; fora do ar e áudio ruim, não", () => {
    expect(recusaDaConta("transcription_429:credit_balance_exhausted")).toBe(true);
    expect(recusaDaConta("transcription_429")).toBe(true);
    expect(recusaDaConta("transcription_402")).toBe(true);
    expect(recusaDaConta("transcription_401:invalid_api_key")).toBe(true);
    expect(recusaDaConta("transcription_500")).toBe(false);
    expect(recusaDaConta("transcription_400:invalid_file")).toBe(false);
    expect(recusaDaConta("fetch failed")).toBe(false);
  });
});

describe("comReserva", () => {
  it("o principal respondeu: a reserva nem é consultada", async () => {
    const reserva = vi.fn(async () => que("da reserva"));
    expect(await comReserva(que("do principal"), reserva).transcribe(audio, "audio/ogg")).toBe("do principal");
    expect(reserva).not.toHaveBeenCalled();
  });

  it("o principal sem saldo: a reserva transcreve, e quem chama fica sabendo por quê", async () => {
    const avisar = vi.fn();
    const t = comReserva(queFalha("transcription_429:credit_balance_exhausted"), async () => que("quero saber o preço"), avisar);
    expect(await t.transcribe(audio, "audio/ogg")).toBe("quero saber o preço");
    expect(avisar).toHaveBeenCalledWith("transcription_429:credit_balance_exhausted");
  });

  it("sem chave para a reserva, vale o erro do principal — é ele que diz o que regularizar", async () => {
    const t = comReserva(queFalha("transcription_429:credit_balance_exhausted"), async () => null);
    await expect(t.transcribe(audio, "audio/ogg")).rejects.toThrow("transcription_429:credit_balance_exhausted");
  });

  it("falha que não é da conta não troca de provedor", async () => {
    const reserva = vi.fn(async () => que("x"));
    await expect(comReserva(queFalha("transcription_500"), reserva).transcribe(audio, "audio/ogg")).rejects.toThrow("transcription_500");
    expect(reserva).not.toHaveBeenCalled();
  });

  it("as duas recusaram: o erro começa pelo do principal e ainda explica o saldo ao dono", async () => {
    const t = comReserva(queFalha("transcription_429:credit_balance_exhausted"), async () => queFalha("transcription_401:reserva"));
    const erro = await t.transcribe(audio, "audio/ogg").catch((e: Error) => e.message);
    expect(erro).toBe("transcription_429:credit_balance_exhausted (reserva: transcription_401:reserva)");
    expect(motivoDaFalhaDeTranscricao(erro as string)).toContain("sem saldo");
  });
});

describe("elevenlabsTranscriptionProvider", () => {
  it("manda o áudio para o endereço de transcrição do provedor de voz, com a chave no cabeçalho dele", async () => {
    const fetchFalso = vi.fn(async () => new Response(JSON.stringify({ text: "oi, tudo bem?" }), { status: 200 }));
    const texto = await elevenlabsTranscriptionProvider({ apiKey: "chave" }, fetchFalso as never).transcribe(audio, "audio/ogg; codecs=opus");

    expect(texto).toBe("oi, tudo bem?");
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    expect((init.headers as Record<string, string>)["xi-api-key"]).toBe("chave");
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v1");
    expect(form.get("tag_audio_events")).toBe("false");
    expect((form.get("file") as File).name).toBe("audio.ogg");
  });

  it("recusa do provedor vira erro com o status e a marca da reserva, sem corpo de erro", async () => {
    const fetchFalso = vi.fn(async () => new Response('{"detail":{"message":"quota"}}', { status: 401 }));
    await expect(elevenlabsTranscriptionProvider({ apiKey: "k" }, fetchFalso as never).transcribe(audio, "audio/ogg")).rejects.toThrow(
      "transcription_401:reserva",
    );
  });
});
