"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Sparkle, Clock, ChatCircle } from "@/lib/ui/icons";
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
  const turnos = config.max_turnos ?? 5;
  const silencio = config.silencio_minutos ?? 15;

  const customPreview = (
    <div className="flex w-full flex-col gap-2">
      {/* Caixa de objetivo do agente */}
      <div className="rounded-lg border border-cat-violet/30 bg-cat-violet-bg p-2.5 text-xs font-medium text-text">
        <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold text-cat-violet-fg uppercase tracking-wider">
          <Sparkle size={12} weight="fill" className="text-cat-violet" />
          <span>Objetivo do Agente</span>
        </div>
        <p className="line-clamp-3 text-[11px] leading-relaxed text-text-muted">
          {objetivo}
        </p>
      </div>

      {/* Parâmetros do agente */}
      <div className="grid grid-cols-2 gap-1.5 text-[10.5px]">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-text-muted">
          <ChatCircle size={12} className="text-cat-violet shrink-0" />
          <span>{t("Máx.")} {turnos} turnos</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-text-muted">
          <Clock size={12} className="text-cat-amber shrink-0" />
          <span>{t("Silêncio:")} {silencio} min</span>
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
