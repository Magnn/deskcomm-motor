"use client";

/**
 * "Também atende estes números" — o mesmo agente, com a mesma configuração, em vários números
 * (`ai_agent_numeros`, migration 0962). Grava na hora, sem publicar versão: muda onde o agente atende,
 * não o que ele diz. O número principal continua sendo o do seletor acima.
 */
import { useEffect, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { SelectableChannel } from "@/lib/channels/selectable";

interface Props {
  agentId: string;
  principal: string;
  channelSessions: SelectableChannel[];
  disabled?: boolean;
}

export function NumerosExtrasDoAgente({ agentId, principal, channelSessions, disabled }: Props) {
  const t = useT();
  const [marcados, setMarcados] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    apiClient
      .get<{ data: { channel_session_ids: string[] } }>(`/api/v1/ai/agents/${agentId}/numeros`)
      .then((r) => vivo && setMarcados(r.data.channel_session_ids))
      .catch((e) => {
        if (vivo) setMarcados([]);
        showApiError(e);
      });
    return () => {
      vivo = false;
    };
  }, [agentId]);

  const outros = channelSessions.filter((s) => s.id !== principal);
  if (outros.length === 0 || marcados === null) return null;

  async function alternar(id: string) {
    if (marcados === null) return;
    const anterior = marcados;
    const proximo = anterior.includes(id) ? anterior.filter((n) => n !== id) : [...anterior, id];
    setMarcados(proximo);
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/numeros`, { channel_session_ids: proximo });
    } catch (e) {
      setMarcados(anterior);
      showApiError(e);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <fieldset className="space-y-2 pt-2" aria-busy={salvando}>
      <legend className="text-sm font-medium">{t("Também atende estes números")}</legend>
      <p className="text-xs text-muted-foreground">
        {t("Mesma configuração em todos: mudou aqui, muda em todos. Vale na hora, sem publicar.")}
      </p>
      <ul className="space-y-1">
        {outros.map((s) => (
          <li key={s.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={marcados.includes(s.id)}
                disabled={disabled || salvando}
                onChange={() => void alternar(s.id)}
              />
              <span>
                {s.display_name}
                {s.phone_number ? ` · ${s.phone_number}` : ""}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
