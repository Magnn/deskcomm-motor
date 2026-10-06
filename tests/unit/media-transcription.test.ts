import { describe, expect, it, vi } from "vitest";

import { apiTranscriptionProvider, motivoDaFalhaDeTranscricao } from "@/lib/messaging/media/transcription";

describe("apiTranscriptionProvider", () => {
  it("POSTa multipart pro endpoint de transcrição e devolve o texto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "olá, quero comprar" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const provider = apiTranscriptionProvider({ apiKey: "sk-test" }, fetchMock);
    const text = await provider.transcribe(Buffer.from([1, 2, 3]), "audio/ogg; codecs=opus");
    expect(text).toBe("olá, quero comprar");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/audio/transcriptions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    expect(init.body).toBeInstanceOf(FormData);
  });

  it("propaga erro HTTP do provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    const provider = apiTranscriptionProvider({ apiKey: "bad" }, fetchMock);
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow(/transcription_401/);
  });

  /**
   * Produção, 05–06/10: 21 áudios mortos com `transcription_429` e nada no
   * aviso dizia se era pico de chamadas ou conta sem saldo. O código do
   * provedor é o que separa as duas coisas.
   */
  it("leva o código da recusa do provedor junto com o status", async () => {
    const corpo = { error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(corpo), { status: 429, headers: { "content-type": "application/json" } }),
    );
    const provider = apiTranscriptionProvider({ apiKey: "sk-test" }, fetchMock);
    await expect(provider.transcribe(Buffer.from([1]), "audio/ogg")).rejects.toThrow("transcription_429:insufficient_quota");
  });

  it("nunca repete a frase livre do provedor, que traz parte da chave no 401", async () => {
    const corpo = { error: { message: "Incorrect API key provided: sk-abc***xyz", code: "sk-abc***xyz vazou" } };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(corpo), { status: 401, headers: { "content-type": "application/json" } }),
    );
    const provider = apiTranscriptionProvider({ apiKey: "sk-test" }, fetchMock);
    const erro = await provider.transcribe(Buffer.from([1]), "audio/ogg").catch((e: Error) => e.message);
    expect(erro).toBe("transcription_401");
  });

  it("traduz a recusa em uma frase com ação, e devolve null para o que não conhece", () => {
    expect(motivoDaFalhaDeTranscricao("transcription_429:insufficient_quota")).toMatch(/sem saldo/);
    expect(motivoDaFalhaDeTranscricao("transcription_429:rate_limit_exceeded")).toMatch(/limite de uso/);
    expect(motivoDaFalhaDeTranscricao("transcription_429")).toMatch(/limite de uso/);
    expect(motivoDaFalhaDeTranscricao("transcription_401:invalid_api_key")).toMatch(/recusou a chave/);
    expect(motivoDaFalhaDeTranscricao("transcription_503")).toBeNull();
    expect(motivoDaFalhaDeTranscricao("storage_download_failed: x")).toBeNull();
  });

  it("normaliza baseUrl em todos os formatos sem duplicar /v1 nem manter barra final", async () => {
    const cenarios = [
      { input: undefined, esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.openai.com", esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.openai.com/", esperado: "https://api.openai.com/v1/audio/transcriptions" },
      { input: "https://api.groq.com/openai/v1", esperado: "https://api.groq.com/openai/v1/audio/transcriptions" },
      { input: "https://api.groq.com/openai/v1/", esperado: "https://api.groq.com/openai/v1/audio/transcriptions" },
      { input: "http://10.0.0.1:8000/v1", esperado: "http://10.0.0.1:8000/v1/audio/transcriptions" },
      { input: "http://10.0.0.1:8000", esperado: "http://10.0.0.1:8000/v1/audio/transcriptions" },
    ];

    for (const c of cenarios) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ text: "ok" }), { status: 200, headers: { "content-type": "application/json" } }),
      );
      const provider = apiTranscriptionProvider({ apiKey: "sk-test", baseUrl: c.input }, fetchMock);
      await provider.transcribe(Buffer.from([1]), "audio/ogg");
      expect(String(fetchMock.mock.calls[0]![0])).toBe(c.esperado);
    }
  });
});
