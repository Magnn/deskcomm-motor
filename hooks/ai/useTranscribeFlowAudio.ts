"use client";
/**
 * Transcrição de um áudio já enviado para um item do nó "Conteúdo":
 * `POST /ai/followup-flows/:id/content-media/transcribe`.
 *
 * Sem toast de erro genérico aqui: transcrição é OPCIONAL, e quem chama decide o
 * tom — falta de chave é um aviso com instrução, não um erro do envio do áudio.
 */
import { useMutation } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

interface Resposta {
  data: { transcript: string };
}

export function useTranscribeFlowAudio() {
  return useMutation({
    mutationFn: async (args: { flowId: string; storage_path: string; mime: string }) => {
      const res = await apiClient.post<Resposta>(
        `/api/v1/ai/followup-flows/${args.flowId}/content-media/transcribe`,
        { storage_path: args.storage_path, mime: args.mime },
      );
      return res.data.transcript;
    },
  });
}
