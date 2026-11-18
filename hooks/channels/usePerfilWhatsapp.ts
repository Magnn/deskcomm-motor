"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { PerfilComercial, PerfilDoNumero } from "@/lib/channels/meta/perfil-do-numero";

const chave = (id: string) => ["perfil-whatsapp", id] as const;
const caminho = (id: string) => `/api/v1/channel-sessions/${id}/perfil-whatsapp`;

/** Perfil do número oficial lido na Meta — GET .../perfil-whatsapp. */
export function usePerfilWhatsapp(channelId: string) {
  return useQuery({
    queryKey: chave(channelId),
    queryFn: () => apiClient.get<{ data: PerfilDoNumero }>(caminho(channelId)).then((r) => r.data),
    retry: false,
  });
}

export type AcaoDoPerfil =
  | { acao: "nome"; nome: string }
  | { acao: "foto"; tipo: "image/jpeg" | "image/png"; base64: string }
  | { acao: "pedir_codigo" }
  | { acao: "conferir_codigo"; codigo: string }
  | { acao: "registrar" };

export function useSalvarPerfilWhatsapp(channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (perfil: PerfilComercial) => apiClient.patch(caminho(channelId), perfil),
    onSettled: () => qc.invalidateQueries({ queryKey: chave(channelId) }),
  });
}

export function useAcaoPerfilWhatsapp(channelId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (corpo: AcaoDoPerfil) => apiClient.post(caminho(channelId), corpo),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: chave(channelId) });
      // O nome e o estado aparecem também no cartão do número.
      void qc.invalidateQueries({ queryKey: ["channel-sessions"] });
    },
  });
}
