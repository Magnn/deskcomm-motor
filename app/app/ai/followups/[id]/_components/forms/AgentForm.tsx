"use client";

import { useState } from "react";

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
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {t(
          "Este nó transfere temporariamente o controle da conversa para um Agente de IA autônomo até que o objetivo seja cumprido ou o limite de turnos seja atingido."
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Configurar Diálogo")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="agent-objetivo" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Instrução Adicional / Objetivo do Agente")}
        </label>
        <textarea
          id="agent-objetivo"
          rows={4}
          maxLength={500}
          value={objetivo}
          onChange={(e) => {
            setObjetivo(e.target.value);
            commit({ objetivo: e.target.value });
          }}
          placeholder={t("Ex: Qualificar se o lead tem interesse no plano anual e direcionar para o link de compra.")}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[13px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
        />
        <p className="text-[11px] text-slate-400">
          {t("O que o agente deve focar em atingir neste ponto específico da jornada.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <div className="space-y-1.5">
          <label htmlFor="agent-max-turnos" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Máximo de turnos")}
          </label>
          <div className="flex items-center gap-1.5">
            <input
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
              className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
            />
          </div>
          <span className="text-[10px] text-slate-400">{t("1 a 30 mensagens")}</span>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="agent-silencio" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Silêncio")}
          </label>
          <div className="flex items-center gap-1.5">
            <input
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
              className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
            />
            <span className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 px-2 py-2 text-[12px] font-medium text-slate-600 dark:text-zinc-400">
              Min.
            </span>
          </div>
          <span className="text-[10px] text-slate-400">{t("Tempo sem resposta")}</span>
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
