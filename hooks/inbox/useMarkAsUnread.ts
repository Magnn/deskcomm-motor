"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";

/**
 * Marca a conversa como NÃO lida — o par do `useMarkAsRead`. Quem chama precisa SAIR da conversa em
 * seguida: com ela aberta, a leitura automática zeraria o contador de novo em 1,5 s.
 */
export function useMarkAsUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ data: unknown }>(`/api/v1/conversations/${id}/mark-unread`, {}),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", id] });
      // A família dos contadores do topo tem chave própria (ver `useMarkAsRead`).
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
