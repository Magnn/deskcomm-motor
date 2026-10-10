/**
 * O SERVIÇO PRÓPRIO DE TRANSCRIÇÃO TEM O CAMINHO PADRÃO ATRÁS DELE.
 *
 * Quem aponta `TRANSCRIPTION_BASE_URL` para um Whisper rodando na própria máquina ficava sem reserva
 * nenhuma: esse caminho ignorava as chaves da organização. Serviço próprio fora do ar era áudio sem
 * leitura, mesmo com três chaves cadastradas.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { apiTranscriptionProvider, comPadraoAtras, type TranscriptionProvider } from "@/lib/messaging/media/transcription";

const audio = Buffer.from("fala");
const que = (texto: string): TranscriptionProvider => ({ transcribe: async () => texto });
const falha = (motivo: string): TranscriptionProvider => ({
  transcribe: async () => {
    throw new Error(motivo);
  },
});

describe("comPadraoAtras", () => {
  it("serviço próprio de pé: é ele que transcreve, e o padrão nem é chamado", async () => {
    const padrao = { transcribe: vi.fn(async () => "do padrão") };
    await expect(comPadraoAtras(que("do próprio"), padrao).transcribe(audio, "audio/ogg")).resolves.toBe("do próprio");
    expect(padrao.transcribe).not.toHaveBeenCalled();
  });

  it.each(["fetch failed", "transcription_500", "The operation was aborted due to timeout", "transcription_401"])(
    "⭐ serviço próprio falhou (%s): o áudio segue pelo caminho padrão",
    async (motivo) => {
      const avisos: string[] = [];
      const cadeia = comPadraoAtras(falha(motivo), que("do padrão"), (m) => avisos.push(m));
      await expect(cadeia.transcribe(audio, "audio/ogg")).resolves.toBe("do padrão");
      expect(avisos).toEqual([motivo]);
    },
  );

  it("os dois falharam: sobe o erro do PADRÃO — é ele que diz o que regularizar", async () => {
    const cadeia = comPadraoAtras(falha("fetch failed"), falha("transcription_429:insufficient_quota"));
    await expect(cadeia.transcribe(audio, "audio/ogg")).rejects.toThrow("transcription_429:insufficient_quota");
  });
});

describe("o teto de tempo do pedido", () => {
  it("com `timeoutMs`, o pedido leva um sinal de aborto; sem, segue como sempre", async () => {
    const rede = vi.fn(async () => new Response(JSON.stringify({ text: "oi" })));
    await apiTranscriptionProvider({ apiKey: "k", timeoutMs: 1000 }, rede as unknown as typeof fetch).transcribe(audio, "audio/ogg");
    await apiTranscriptionProvider({ apiKey: "k" }, rede as unknown as typeof fetch).transcribe(audio, "audio/ogg");
    const chamadas = rede.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(chamadas[0]![1].signal).toBeInstanceOf(AbortSignal);
    expect(chamadas[1]![1].signal).toBeUndefined();
  });
});

describe("a fiação no worker", () => {
  it("⭐ o serviço da instalação é montado com o caminho padrão atrás e com teto de tempo", () => {
    const fonte = readFileSync("workers/media-derive-worker.ts", "utf8");
    const trecho = fonte.slice(fonte.indexOf("const transcriber: DeriveDeps"));
    expect(trecho.slice(0, 700)).toContain("comPadraoAtras(");
    expect(trecho.slice(0, 700)).toContain("timeoutMs:");
    expect(trecho.slice(0, 900)).toContain("transcricaoPadrao!");
  });
});
