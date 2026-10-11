"use client";
/**
 * Upload de mídia para um item do nó "Conteúdo" — irmão de `useUploadMedia`
 * (inbox), mas por FLUXO, não por conversa: `POST /ai/followup-flows/:id/content-media`.
 *
 * Por `XMLHttpRequest`, não `fetch`: só ele conta os bytes que SAÍRAM. É o que
 * dá a porcentagem na tela e, mais importante, o que deixa perceber um envio
 * que parou de avançar — com `fetch` sem prazo o card ficava em "Enviando…"
 * para sempre, sem erro e sem saída, quando a conexão morria no meio.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";

export interface UploadedFlowMedia {
  storage_path: string;
  media_mime: string;
  media_size_bytes: number;
  kind: "image" | "video" | "audio" | "document" | "sticker";
}

/** Sem um byte novo saindo por este tempo, o envio é dado como parado. */
export const ENVIO_SEM_AVANCO_MS = 45_000;
/** Depois do último byte: o servidor ainda valida e grava no Storage. */
export const ENVIO_ESPERA_RESPOSTA_MS = 120_000;

export const ENVIO_CANCELADO = "upload_cancelled";

interface Args {
  flowId: string;
  file: File;
  as?: "sticker";
}

type Resposta = Partial<ApiErrorBody> & { data?: UploadedFlowMedia };

/** Resposta que não é JSON (página do proxy, corpo vazio) vira `null` — erro genérico. */
function lerResposta(texto: string): Resposta | null {
  try {
    return JSON.parse(texto) as Resposta;
  } catch {
    return null;
  }
}

export function enviarMidiaDoFluxo(
  args: Args,
  opts: { signal?: AbortSignal; onProgress?: (porcento: number) => void } = {},
): Promise<UploadedFlowMedia> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", args.file, args.file.name);
    // Figurinha declara a intenção: é o que deixa o .webp passar na rota.
    if (args.as) form.append("as", args.as);

    const xhr = new XMLHttpRequest();
    let prazo: ReturnType<typeof setTimeout> | undefined;
    let motivoDoCorte: ApiError | null = null;

    const cortar = (erro: ApiError) => {
      motivoDoCorte = erro;
      xhr.abort();
    };
    const armar = (ms: number, mensagem: string) => {
      clearTimeout(prazo);
      prazo = setTimeout(() => cortar(new ApiError(0, "upload_stalled", undefined, "", mensagem)), ms);
    };
    const encerrar = () => {
      clearTimeout(prazo);
      opts.signal?.removeEventListener("abort", aoCancelar);
    };
    const aoCancelar = () => cortar(new ApiError(0, ENVIO_CANCELADO, undefined, "", "Envio cancelado."));

    const PAROU = "O envio parou de avançar. Confira a conexão e tente de novo.";
    xhr.upload.onprogress = (e) => {
      armar(ENVIO_SEM_AVANCO_MS, PAROU);
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(100, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.upload.onload = () => {
      opts.onProgress?.(100);
      armar(ENVIO_ESPERA_RESPOSTA_MS, "O arquivo foi enviado, mas o servidor não respondeu. Tente de novo.");
    };

    xhr.onload = () => {
      encerrar();
      const json = lerResposta(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && json?.data) {
        resolve(json.data);
        return;
      }
      const e = json?.error;
      reject(
        new ApiError(
          xhr.status,
          e?.code ?? "upload_failed",
          e?.details,
          e?.request_id ?? "",
          e?.message ?? "Não foi possível enviar o arquivo. Tente de novo.",
        ),
      );
    };
    xhr.onerror = () => {
      encerrar();
      reject(new ApiError(0, "upload_failed", undefined, "", "Não foi possível enviar o arquivo. Confira a conexão e tente de novo."));
    };
    xhr.onabort = () => {
      encerrar();
      reject(motivoDoCorte ?? new ApiError(0, ENVIO_CANCELADO, undefined, "", "Envio cancelado."));
    };

    if (opts.signal?.aborted) {
      reject(new ApiError(0, ENVIO_CANCELADO, undefined, "", "Envio cancelado."));
      return;
    }
    opts.signal?.addEventListener("abort", aoCancelar);

    xhr.open("POST", `/api/v1/ai/followup-flows/${args.flowId}/content-media`);
    armar(ENVIO_SEM_AVANCO_MS, PAROU);
    xhr.send(form);
  });
}

export function useUploadFlowContentMedia() {
  /** 0–100 enquanto envia; `null` parado. */
  const [progresso, setProgresso] = useState<number | null>(null);
  const controle = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async (args: Args) => {
      const c = new AbortController();
      controle.current = c;
      setProgresso(0);
      try {
        return await enviarMidiaDoFluxo(args, { signal: c.signal, onProgress: setProgresso });
      } finally {
        if (controle.current === c) controle.current = null;
        setProgresso(null);
      }
    },
    onError: (err) => {
      // Cancelar é escolha de quem está na tela, não erro a anunciar.
      if (err instanceof ApiError && err.code === ENVIO_CANCELADO) return;
      showApiError(err);
    },
  });

  // Card removido (ou painel fechado) no meio do envio: o pedido não fica órfão.
  useEffect(() => () => controle.current?.abort(), []);

  return { ...mutation, progresso, cancelar: () => controle.current?.abort() };
}
