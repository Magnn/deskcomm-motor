"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";
import type { PagamentoRecebido, ResultadoDoPagamento, SugestaoDePagamento } from "@/lib/pagamentos/pagamento-recebido";

/** Os produtos que a organização vende, com o valor de cada um. Só busca com o diálogo aberto. */
export function useSugestoesDePagamento(conversationId: string, aberto: boolean) {
  return useQuery({
    queryKey: ["pagamento-recebido", "sugestoes"],
    enabled: aberto,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await apiClient.get<{ data: { sugestoes: SugestaoDePagamento[] } }>(`/api/v1/conversations/${conversationId}/pagamento-recebido`)).data.sugestoes,
  });
}

/**
 * Registra um pagamento que entrou por fora do checkout. Invalida a conversa e o painel do
 * negócio: o contato ganha a marca de pago e o negócio muda de etapa.
 */
export function useRegistrarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { conversation_id: string; pagamento: Omit<PagamentoRecebido, "metodo" | "iniciar_entrega"> & Partial<Pick<PagamentoRecebido, "metodo" | "iniciar_entrega">> }) =>
      (await apiClient.post<{ data: ResultadoDoPagamento }>(`/api/v1/conversations/${args.conversation_id}/pagamento-recebido`, args.pagamento)).data,
    onError: (err) => showApiError(err),
    onSuccess: (_data, args) => {
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation", args.conversation_id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}
