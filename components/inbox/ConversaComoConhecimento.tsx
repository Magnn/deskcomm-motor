"use client";
/**
 * "Usar esta conversa para ensinar a IA" — a marca que faz uma conversa ENCERRADA entrar no
 * conhecimento do agente.
 *
 * A rota e a rotina diária que consome a marca existiam; nenhuma tela as alcançava. O que a
 * pessoa precisa saber antes de marcar está escrito no próprio controle: só vale depois de a
 * conversa ser encerrada, e os dados pessoais são retirados antes — conversa em que essa
 * retirada não é segura fica para revisão em vez de entrar.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

interface Estado {
  id: string;
  usable_for_rag: boolean;
  rag_review_status?: string | null;
}

export function ConversaComoConhecimento({ conversationId }: { conversationId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const chave = ["conversa-como-conhecimento", conversationId];
  const query = useQuery({
    queryKey: chave,
    queryFn: async () =>
      (await apiClient.get<{ data: Estado }>(`/api/v1/conversations/${conversationId}/usable-for-rag`)).data,
    staleTime: 30_000,
  });
  const [salvando, setSalvando] = React.useState(false);

  async function mudar(ligado: boolean): Promise<void> {
    setSalvando(true);
    try {
      const res = await apiClient.post<{ data: Estado }>(`/api/v1/conversations/${conversationId}/usable-for-rag`, {
        enabled: ligado,
      });
      qc.setQueryData(chave, { ...query.data, ...res.data, rag_review_status: null });
      toast.success(ligado ? t("Conversa marcada para ensinar a IA.") : t("Conversa desmarcada."));
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  }

  // Sem o estado lido o controle não aparece: nascer desligado faria um clique DESMARCAR o que
  // já estava marcado.
  if (!query.data) return null;
  const id = `conhecimento-${conversationId}`;

  return (
    <div className="flex flex-col gap-1 px-1" data-testid="conversa-como-conhecimento">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-sm">
          {t("Usar esta conversa para ensinar a IA")}
        </Label>
        <Switch
          id={id}
          checked={query.data.usable_for_rag}
          disabled={salvando}
          onCheckedChange={(v) => void mudar(v)}
        />
      </div>
      <p className="text-xs text-text-muted">
        {t("Depois de encerrada, a conversa entra no conhecimento do agente na rotina da madrugada. Nomes, telefones, e-mails e documentos são retirados antes.")}
      </p>
      {query.data.rag_review_status === "pending_review" ? (
        <p role="status" className="text-xs text-warning-fg" data-testid="conhecimento-em-revisao">
          {t("Esta conversa ficou de fora: não foi possível garantir a retirada dos dados pessoais.")}
        </p>
      ) : null}
    </div>
  );
}
