/**
 * O SERVIÇO PRÓPRIO DE TRANSCRIÇÃO RECEBE UM ÁUDIO DE CADA VEZ.
 *
 * Dez transcrições simultâneas num Whisper de 4 núcleos: nenhuma termina no prazo, e o pedido
 * cortado segue ocupando a máquina. Em fila, a mesma demanda cabe com folga.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { comPadraoAtras, umDeCadaVez, type TranscriptionProvider } from "@/lib/messaging/media/transcription";

const audio = Buffer.from("fala");

/** Serviço que só termina quando o teste manda, e conta quantos estão em curso. */
function servicoLento() {
  const pendentes: Array<(texto: string) => void> = [];
  let emCurso = 0;
  let pico = 0;
  const servico: TranscriptionProvider = {
    transcribe: () =>
      new Promise<string>((resolve) => {
        emCurso += 1;
        pico = Math.max(pico, emCurso);
        pendentes.push((texto) => {
          emCurso -= 1;
          resolve(texto);
        });
      }),
  };
  return { servico, pendentes, pico: () => pico, emCurso: () => emCurso };
}

const giro = () => vi.advanceTimersByTimeAsync(0);

describe("umDeCadaVez", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("⭐ cinco áudios chegam juntos: o serviço nunca vê mais de um", async () => {
    const lento = servicoLento();
    const fila = umDeCadaVez(lento.servico, { simultaneos: 1, esperaMaximaMs: 60_000 });
    const respostas = [1, 2, 3, 4, 5].map(() => fila.transcribe(audio, "audio/ogg"));
    for (let i = 1; i <= 5; i++) {
      await giro();
      expect(lento.emCurso()).toBe(1);
      lento.pendentes.shift()!(`texto ${i}`);
    }
    await expect(Promise.all(respostas)).resolves.toEqual(["texto 1", "texto 2", "texto 3", "texto 4", "texto 5"]);
    expect(lento.pico()).toBe(1);
  });

  it("respeita o número de vagas configurado", async () => {
    const lento = servicoLento();
    const fila = umDeCadaVez(lento.servico, { simultaneos: 2, esperaMaximaMs: 60_000 });
    const respostas = [1, 2, 3, 4].map(() => fila.transcribe(audio, "audio/ogg"));
    await giro();
    expect(lento.emCurso()).toBe(2);
    while (lento.pendentes.length > 0) {
      lento.pendentes.shift()!("ok");
      await giro();
    }
    await Promise.all(respostas);
    expect(lento.pico()).toBe(2);
  });

  it("⭐ quem esperou demais pela vez segue pelo caminho padrão, sem ocupar o serviço", async () => {
    const lento = servicoLento();
    const padrao = { transcribe: vi.fn(async () => "do padrão") };
    const avisos: string[] = [];
    const cadeia = comPadraoAtras(
      umDeCadaVez(lento.servico, { simultaneos: 1, esperaMaximaMs: 30_000 }),
      padrao,
      (m) => avisos.push(m),
    );
    const primeiro = cadeia.transcribe(audio, "audio/ogg");
    const segundo = cadeia.transcribe(audio, "audio/ogg");
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(segundo).resolves.toBe("do padrão");
    expect(avisos).toEqual(["transcription_fila_cheia"]);
    // O serviço só recebeu o primeiro; a vaga dele continua valendo para o próximo.
    expect(lento.pendentes).toHaveLength(1);
    lento.pendentes.shift()!("do próprio");
    await expect(primeiro).resolves.toBe("do próprio");
    const terceiro = cadeia.transcribe(audio, "audio/ogg");
    await giro();
    expect(lento.emCurso()).toBe(1);
    lento.pendentes.shift()!("de novo o próprio");
    await expect(terceiro).resolves.toBe("de novo o próprio");
  });

  it("falha do serviço devolve a vaga", async () => {
    let chamadas = 0;
    const fila = umDeCadaVez(
      {
        transcribe: async () => {
          chamadas += 1;
          if (chamadas === 1) throw new Error("transcription_500");
          return "ok";
        },
      },
      { simultaneos: 1, esperaMaximaMs: 1_000 },
    );
    await expect(fila.transcribe(audio, "audio/ogg")).rejects.toThrow("transcription_500");
    await expect(fila.transcribe(audio, "audio/ogg")).resolves.toBe("ok");
  });

  it.each([Number.NaN, 0, -3])("vagas inválidas (%s) valem 1, não travam a fila", async (vagas) => {
    const lento = servicoLento();
    const fila = umDeCadaVez(lento.servico, { simultaneos: vagas, esperaMaximaMs: 60_000 });
    const a = fila.transcribe(audio, "audio/ogg");
    const b = fila.transcribe(audio, "audio/ogg");
    await giro();
    expect(lento.emCurso()).toBe(1);
    lento.pendentes.shift()!("a");
    await giro();
    lento.pendentes.shift()!("b");
    await expect(Promise.all([a, b])).resolves.toEqual(["a", "b"]);
  });
});
