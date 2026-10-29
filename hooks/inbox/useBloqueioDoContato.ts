"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

interface BloqueioArgs {
  conversation_id: string;
  bloquear: boolean;
}

interface BloqueioResponse {
  data: { bloqueado: boolean };
}

/**
 * Bloqueia ou desbloqueia o contato desta conversa — a verificação manual do opt-out.
 *
 * O bloqueio automático erra (29/10/2026: "parar de insistir", falando do homem dela, bloqueou uma
 * cliente) e não havia como desfazer pela tela. Invalida a conversa e a lista: o selo de quem manda
 * e o "Devolver ao automático" dependem de `is_blocked`.
 */
export function useBloqueioDoContato() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: BloqueioArgs) =>
      apiClient.post<BloqueioResponse>(`/api/v1/conversations/${args.conversation_id}/bloqueio`, {
        bloquear: args.bloquear,
      }),
    onError: (err) => showApiError(err),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
