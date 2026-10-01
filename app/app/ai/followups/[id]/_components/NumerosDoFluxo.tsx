"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { NumeroDoFluxo } from "@/app/api/v1/ai/followup-flows/[id]/numeros/route";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { channelLabel } from "@/hooks/channels/useChannelSessions";
import type { FollowupFlowStatus } from "@/hooks/followup/useFollowupFlows";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

interface Props {
  flowId: string;
  flowStatus: FollowupFlowStatus;
}

/**
 * Os números que ESTE fluxo responde.
 *
 * Um número tem um dono por vez — um fluxo, o agente de IA, ou só gente. Ligar o
 * vínculo aqui tira o número de quem o tinha (o agente, ou outro fluxo) e o dá a
 * este fluxo; desligar devolve o número ao agente de IA. É o MESMO dado que a
 * tela de Conexões edita ("Fluxo & Atendimento"): ele mora no número, não aqui.
 *
 * Antes havia neste lugar um seletor que gravava o número dentro do gatilho — e
 * nada no motor lia. Quem escolhia um número achava que tinha vinculado, e o
 * número seguia no agente.
 */
export function NumerosDoFluxo({ flowId, flowStatus }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const chave = ["followup", "flow-numeros", flowId];

  const numeros = useQuery({
    queryKey: chave,
    queryFn: async () =>
      (await apiClient.get<{ data: NumeroDoFluxo[] }>(`/api/v1/ai/followup-flows/${flowId}/numeros`)).data,
  });

  const vincular = useMutation({
    mutationFn: async ({ numero, ligado }: { numero: NumeroDoFluxo; ligado: boolean }) => {
      await apiClient.patch(`/api/v1/channel-sessions/${numero.id}/flow`, {
        handling_mode: ligado ? "flow" : "ai",
        default_flow_pointer_id: ligado ? flowId : null,
      });
      return { numero, ligado };
    },
    onSuccess: async ({ numero, ligado }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: chave }),
        qc.invalidateQueries({ queryKey: ["channel-flow-config", numero.id] }),
      ]);
      toast.success(
        ligado
          ? t("Número vinculado: este fluxo passa a responder, e o agente de IA não é mais chamado neste número.")
          : t("Número liberado: ele voltou para o agente de IA, que só responde se houver um agente publicado para este número."),
      );
    },
    onError: (err) => showApiError(err),
  });

  const publicado = flowStatus === "active";
  const lista = numeros.data ?? [];
  const presoAFluxoParado = !publicado && lista.some((n) => n.dono === "este_fluxo");

  const donoAtual = (n: NumeroDoFluxo): string => {
    if (n.dono === "este_fluxo") return t("Este fluxo responde este número.");
    if (n.dono === "outro_fluxo") return `${t("Hoje responde o fluxo")} "${n.outro_fluxo ?? t("(apagado)")}".`;
    if (n.dono === "humano") return t("Hoje: só atendimento humano.");
    return t("Hoje: agente de IA.");
  };

  return (
    <div className="space-y-2 border-t border-border pt-3" data-testid="numeros-do-fluxo">
      <Label>{t("Números que este fluxo responde")}</Label>
      <p className="text-[11px] text-muted-foreground">
        {t("Com o vínculo ligado, toda mensagem que chega no número entra neste fluxo e o agente de IA não é chamado.")}
      </p>

      {numeros.isLoading && <p className="text-xs text-muted-foreground">{t("Carregando...")}</p>}
      {numeros.isError && (
        <p className="text-xs text-destructive">{t("Não foi possível carregar os números. Feche e abra de novo.")}</p>
      )}
      {numeros.data && lista.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("Nenhum número conectado ainda. Conecte um em Conexões.")}</p>
      )}

      {!publicado && lista.length > 0 && !presoAFluxoParado && (
        <p className="text-xs text-muted-foreground" data-testid="numeros-publique-antes">
          {t("Publique o fluxo para poder vincular um número.")}
        </p>
      )}
      {presoAFluxoParado && (
        <p className="text-xs text-destructive" data-testid="numeros-fluxo-parado">
          {t("Este fluxo não está publicado e ainda tem número vinculado: ninguém responde automaticamente nele. Publique o fluxo ou desligue o vínculo.")}
        </p>
      )}

      <ul className="space-y-2">
        {lista.map((n) => {
          const ligado = n.dono === "este_fluxo";
          return (
            <li key={n.id} className="flex items-start justify-between gap-3" data-testid={`numero-${n.id}`}>
              <div className="min-w-0">
                <p className="truncate text-sm text-text">
                  {channelLabel(n, t)}
                  {n.phone_number && n.display_name ? ` (${n.phone_number})` : ""}
                </p>
                <p className="text-[11px] text-muted-foreground">{donoAtual(n)}</p>
              </div>
              <Switch
                aria-label={`${t("Este fluxo responde o número")} ${channelLabel(n, t)}`}
                checked={ligado}
                // Ligar exige fluxo publicado (o servidor também recusa). Desligar
                // é sempre permitido: é como se tira um número de um fluxo parado.
                disabled={vincular.isPending || (!ligado && !publicado)}
                onCheckedChange={(v) => vincular.mutate({ numero: n, ligado: v })}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
