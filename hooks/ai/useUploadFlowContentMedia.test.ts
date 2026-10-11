/**
 * O envio não pode ficar pendurado sem saída: ou termina, ou é cortado com um
 * motivo que a tela mostra. Os casos abaixo dirigem um XMLHttpRequest falso
 * pelos eventos que o navegador de verdade emite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/types";

import {
  ENVIO_CANCELADO,
  ENVIO_ESPERA_RESPOSTA_MS,
  ENVIO_SEM_AVANCO_MS,
  enviarMidiaDoFluxo,
} from "./useUploadFlowContentMedia";

class XhrFalso {
  static ultimo: XhrFalso;
  upload: { onprogress: ((e: unknown) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  responseText = "";
  url = "";
  abortado = false;
  constructor() {
    XhrFalso.ultimo = this;
  }
  open(_metodo: string, url: string) {
    this.url = url;
  }
  send() {}
  abort() {
    this.abortado = true;
    this.onabort?.();
  }
  avancar(loaded: number, total: number) {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total });
  }
  responder(status: number, corpo: string) {
    this.status = status;
    this.responseText = corpo;
    this.onload?.();
  }
}

const ARGS = { flowId: "11111111-1111-4111-8111-111111111111", file: new File(["x"], "principal.pdf", { type: "application/pdf" }) };

async function recusa(p: Promise<unknown>): Promise<ApiError> {
  const erro = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ApiError);
  return erro as ApiError;
}

describe("enviarMidiaDoFluxo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("XMLHttpRequest", XhrFalso);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("devolve o arquivo gravado e informa o progresso", async () => {
    const progresso: number[] = [];
    const p = enviarMidiaDoFluxo(ARGS, { onProgress: (n) => progresso.push(n) });
    const xhr = XhrFalso.ultimo;
    expect(xhr.url).toBe(`/api/v1/ai/followup-flows/${ARGS.flowId}/content-media`);
    xhr.avancar(250, 1000);
    xhr.avancar(1000, 1000);
    xhr.upload.onload?.();
    xhr.responder(200, JSON.stringify({ data: { storage_path: "org/flow-content/f/a.pdf", media_mime: "application/pdf", media_size_bytes: 1, kind: "document" } }));
    await expect(p).resolves.toMatchObject({ storage_path: "org/flow-content/f/a.pdf" });
    expect(progresso).toEqual([25, 100, 100]);
  });

  it("corta o envio que parou de avançar, em vez de esperar para sempre", async () => {
    const p = enviarMidiaDoFluxo(ARGS);
    const xhr = XhrFalso.ultimo;
    xhr.avancar(100, 1000);
    vi.advanceTimersByTime(ENVIO_SEM_AVANCO_MS - 1);
    expect(xhr.abortado).toBe(false);
    vi.advanceTimersByTime(1);
    const erro = await recusa(p);
    expect(xhr.abortado).toBe(true);
    expect(erro.code).toBe("upload_stalled");
    expect(erro.message).toContain("parou de avançar");
  });

  it("enquanto os bytes saem, o prazo recomeça", async () => {
    const p = enviarMidiaDoFluxo(ARGS);
    const xhr = XhrFalso.ultimo;
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(ENVIO_SEM_AVANCO_MS - 1000);
      xhr.avancar(i * 100, 1000);
    }
    expect(xhr.abortado).toBe(false);
    xhr.responder(200, JSON.stringify({ data: { storage_path: "a", media_mime: "application/pdf", media_size_bytes: 1, kind: "document" } }));
    await expect(p).resolves.toBeTruthy();
  });

  it("arquivo entregue e servidor mudo: corta com o motivo certo", async () => {
    const p = enviarMidiaDoFluxo(ARGS);
    const xhr = XhrFalso.ultimo;
    xhr.upload.onload?.();
    vi.advanceTimersByTime(ENVIO_ESPERA_RESPOSTA_MS);
    const erro = await recusa(p);
    expect(erro.code).toBe("upload_stalled");
    expect(erro.message).toContain("servidor não respondeu");
  });

  it("cancelar pelo sinal aborta o pedido e recusa como cancelado", async () => {
    const controle = new AbortController();
    const p = enviarMidiaDoFluxo(ARGS, { signal: controle.signal });
    controle.abort();
    const erro = await recusa(p);
    expect(XhrFalso.ultimo.abortado).toBe(true);
    expect(erro.code).toBe(ENVIO_CANCELADO);
  });

  it("leva adiante a recusa da rota", async () => {
    const p = enviarMidiaDoFluxo(ARGS);
    XhrFalso.ultimo.responder(415, JSON.stringify({ error: { code: "unsupported_media_type", message: "Formato não aceito." } }));
    const erro = await recusa(p);
    expect(erro.status).toBe(415);
    expect(erro.code).toBe("unsupported_media_type");
    expect(erro.message).toBe("Formato não aceito.");
  });

  it("resposta que não é JSON vira erro legível, não exceção de parse", async () => {
    const p = enviarMidiaDoFluxo(ARGS);
    XhrFalso.ultimo.responder(502, "<html>Bad Gateway</html>");
    const erro = await recusa(p);
    expect(erro.status).toBe(502);
    expect(erro.code).toBe("upload_failed");
    expect(erro.message).toContain("Não foi possível enviar o arquivo");
  });
});
