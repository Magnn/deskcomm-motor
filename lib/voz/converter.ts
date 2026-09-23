/**
 * Qualquer áudio → nota de voz do WhatsApp (Ogg/Opus, mono, 48 kHz).
 *
 * É o PLANO B: os dois provedores devolvem Ogg/Opus direto quando pedimos o
 * formato certo (`lib/voz/provedores/*`), e esse é o caminho que não gasta CPU
 * nem depende de binário. Isto só entra quando o provedor recusou o formato
 * Opus (plano antigo, modelo que não o oferece) e entregou mp3.
 *
 * Diferente de `lib/messaging/media/voice-transcode.ts`, que só troca o
 * CONTAINER de um webm que já é Opus (`-c:a copy`), aqui o codec muda — então
 * reencoda de verdade, e por isso é a exceção, não a regra.
 *
 * Sem ffmpeg no processo devolve `sem_conversor`, e quem chamou cai para texto.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ErroDeVoz } from "./erros";
import { ehOggOpus } from "./ogg";
import { MIME_DA_NOTA_DE_VOZ, type AudioGerado } from "./tipos";

/** Nota de voz é curta; acima disto é outra coisa e não vale a CPU. */
const MAX_BYTES = 16 * 1024 * 1024;

export type ExecutarFfmpeg = (args: string[], cwd: string) => Promise<void>;

const executarFfmpegReal: ExecutarFfmpeg = (args, cwd) =>
  new Promise<void>((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-nostdin", "-y", ...args], { cwd });
    let erro = "";
    proc.stderr?.on("data", (d: Buffer) => {
      erro = (erro + d.toString()).slice(-300);
    });
    proc.on("error", (err) => reject(new Error(`spawn:${(err as NodeJS.ErrnoException).code ?? "erro"}`)));
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`exit_${code}:${erro}`))));
  });

export async function converterParaNotaDeVoz(
  entrada: Buffer,
  deps: { executar?: ExecutarFfmpeg } = {},
): Promise<AudioGerado> {
  if (entrada.length === 0 || entrada.length > MAX_BYTES) throw new ErroDeVoz("formato_invalido");
  const executar = deps.executar ?? executarFfmpegReal;
  const dir = await mkdtemp(join(tmpdir(), "voz-conv-"));
  try {
    const arqEntrada = join(dir, "in.audio");
    const arqSaida = join(dir, "out.ogg");
    await writeFile(arqEntrada, entrada);
    try {
      await executar(
        ["-i", arqEntrada, "-vn", "-c:a", "libopus", "-b:a", "32k", "-ar", "48000", "-ac", "1", "-f", "ogg", arqSaida],
        dir,
      );
    } catch (err) {
      // ENOENT = não há ffmpeg neste processo. É estado de instalação, não defeito do áudio.
      if (err instanceof Error && err.message === "spawn:ENOENT") throw new ErroDeVoz("sem_conversor");
      throw new ErroDeVoz("formato_invalido");
    }
    const buffer = await readFile(arqSaida);
    if (!ehOggOpus(buffer)) throw new ErroDeVoz("formato_invalido");
    return { buffer, mime: MIME_DA_NOTA_DE_VOZ };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
