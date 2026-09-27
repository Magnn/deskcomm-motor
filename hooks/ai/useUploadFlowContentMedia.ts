"use client";
/**
 * Upload de mídia para um item do nó "Conteúdo" — irmão de `useUploadMedia`
 * (inbox), mas por FLUXO, não por conversa: `POST /ai/followup-flows/:id/content-media`.
 */
import { useMutation } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ApiError, type ApiErrorBody } from "@/lib/api/types";

export interface UploadedFlowMedia {
  storage_path: string;
  media_mime: string;
  media_size_bytes: number;
  kind: "image" | "video" | "audio" | "document";
}

export function useUploadFlowContentMedia() {
  return useMutation({
    mutationFn: async (args: { flowId: string; file: File }) => {
      const form = new FormData();
      form.append("file", args.file, args.file.name);
      const res = await fetch(`/api/v1/ai/followup-flows/${args.flowId}/content-media`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as Partial<ApiErrorBody> & { data?: UploadedFlowMedia };
      if (!res.ok || !json.data) {
        const e = json.error;
        throw new ApiError(res.status, e?.code ?? "upload_failed", e?.details, e?.request_id ?? "", e?.message);
      }
      return json.data;
    },
    onError: (err) => showApiError(err),
  });
}
