"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "../forms/shared";
import { Clock } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AttendantRouteNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"attendant_route">;

  const customPreview = (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-2.5 shadow-2xs dark:border-border dark:bg-surface">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          <div className="flex flex-col">
            <span className="text-[10px] font-medium text-slate-500">Tempo limite:</span>
            <span className="text-xs font-bold leading-tight text-slate-800 dark:text-slate-200">
              {config.max_wait_minutes ?? 30} min
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 shadow-2xs dark:border-border/60 dark:bg-surface-elevated">
        <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
          Distribuição inteligente entre atendentes
        </span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.attendant_route}
      label={data.label}
      subtitle={describeNodeConfig("attendant_route", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({
        type: "attendant_route",
        config,
      })}
    />
  );
}
