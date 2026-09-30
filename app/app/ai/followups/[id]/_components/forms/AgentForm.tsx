"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  agentNodeConfigSchema,
  AGENT_NODE_DEFAULT_MAX_TURNS,
  AGENT_NODE_DEFAULT_SILENCE_MINUTES,
  AGENT_NODE_UNSET_ID,
} from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

export function AgentForm({
  config,
  onChange,
}: {
  config: ConfigOf<"agent">;
  onChange: (c: ConfigOf<"agent">) => void;
}) {
  const t = useT();
  const [objetivo, setObjetivo] = useState(config.objetivo ?? "Conduzir diálogo com o lead até o objetivo.");
  const [maxTurnos, setMaxTurnos] = useState(config.max_turnos ?? AGENT_NODE_DEFAULT_MAX_TURNS);
  const [silencioMinutos, setSilencioMinutos] = useState(config.silencio_minutos ?? AGENT_NODE_DEFAULT_SILENCE_MINUTES);
  const [agentId, setAgentId] = useState(config.agent_id ?? AGENT_NODE_UNSET_ID);
  const [error, setError] = useState<string | null>(null);

  const commit = (patch: Partial<ConfigOf<"agent">>) => {
    const candidate = {
      agent_id: patch.agent_id !== undefined ? patch.agent_id : agentId,
      objetivo: patch.objetivo !== undefined ? patch.objetivo : objetivo,
      max_turnos: patch.max_turnos !== undefined ? patch.max_turnos : maxTurnos,
      silencio_minutos: patch.silencio_minutos !== undefined ? patch.silencio_minutos : silencioMinutos,
    };

    const parsed = agentNodeConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="space-y-1.5">
        <Label htmlFor="agent-objetivo">{t("Objetivo do Agente")}</Label>
        <Textarea
          id="agent-objetivo"
          rows={4}
          value={objetivo}
          onChange={(e) => {
            setObjetivo(e.target.value);
            commit({ objetivo: e.target.value });
          }}
          placeholder={t("Ex: Descobrir o faturamento mensal da empresa e agendar demonstração.")}
          maxLength={500}
        />
        <p className="text-[11px] text-text-muted">
          {t("O que o agente deve buscar alcançar neste ponto do fluxo.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="agent-max-turnos">{t("Máximo de turnos")}</Label>
          <Input
            id="agent-max-turnos"
            type="number"
            min={1}
            max={30}
            value={maxTurnos}
            onChange={(e) => {
              const val = Math.max(1, Math.min(30, Number(e.target.value) || 1));
              setMaxTurnos(val);
              commit({ max_turnos: val });
            }}
          />
          <p className="text-[10px] text-text-muted">
            {t("1 a 30 mensagens")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-silencio">{t("Silêncio (minutos)")}</Label>
          <Input
            id="agent-silencio"
            type="number"
            min={5}
            max={1440}
            value={silencioMinutos}
            onChange={(e) => {
              const val = Math.max(5, Math.min(1440, Number(e.target.value) || 5));
              setSilencioMinutos(val);
              commit({ silencio_minutos: val });
            }}
          />
          <p className="text-[10px] text-text-muted">
            {t("Tempo sem resposta")}
          </p>
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
