"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Sparkle, Clock, ChatCircle } from "@/lib/ui/icons";
import {
  AGENT_NODE_DEFAULT_MAX_TURNS,
  AGENT_NODE_DEFAULT_SILENCE_MINUTES,
} from "@/lib/followup/graph-schema";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AgentNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = (data.config || {}) as {
    agent_id?: string;
    objetivo?: string;
    max_turnos?: number;
    silencio_minutos?: number;
  };

  const objetivo = config.objetivo || "Conduzir diálogo inteligente com o lead até o objetivo.";
  const turnos = config.max_turnos ?? AGENT_NODE_DEFAULT_MAX_TURNS;
  const silencio = config.silencio_minutos ?? AGENT_NODE_DEFAULT_SILENCE_MINUTES;

  const customPreview = (
    <div className="flex w-full flex-col gap-2">
      {/* Caixa de objetivo do agente */}
      <div className="rounded-lg border border-purple-200/80 bg-purple-50/50 p-2.5 text-xs font-medium text-slate-800 dark:border-purple-900/40 dark:bg-purple-950/20 dark:text-slate-200">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
          <Sparkle size={12} weight="fill" className="text-purple-600" />
          <span>Objetivo do Agente</span>
        </div>
        <p className="line-clamp-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
          {objetivo}
        </p>
      </div>

      {/* Parâmetros do agente */}
      <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50 px-2 py-1 text-slate-600 dark:border-border dark:bg-surface dark:text-slate-400">
          <ChatCircle size={12} className="text-purple-600 shrink-0" />
          <span>{`${t("Máx.")} ${turnos} ${t("turnos")}`}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200/70 bg-slate-50 px-2 py-1 text-slate-600 dark:border-border dark:bg-surface dark:text-slate-400">
          <Clock size={12} className="text-amber-600 shrink-0" />
          <span>{`${t("Silêncio:")} ${silencio} min`}</span>
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.agent}
      label={data.label || "Agente IA"}
      subtitle={describeNodeConfig("agent", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({
        type: "agent",
        config: data.config as ConfigOf<"agent">,
      })}
    />
  );
}
