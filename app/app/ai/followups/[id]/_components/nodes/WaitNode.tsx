"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Clock } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function WaitNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const tempoTexto = describeNodeConfig("wait", data.config, t);

  const customPreview = (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-slate-100 bg-white p-1.5 dark:border-border/60 dark:bg-surface-elevated">
      <div className="flex min-h-[40px] flex-col gap-2 rounded border border-slate-200 bg-slate-50 p-2.5 dark:border-border dark:bg-surface">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Clock size={15} className="shrink-0 text-slate-500" aria-hidden />
          <span>Aguardar o prazo de {tempoTexto}</span>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 pt-2 pl-0.5 text-[11px] font-medium text-slate-500 dark:border-border">
          <div className="h-3 w-1 shrink-0 rounded-full bg-blue-500" />
          <span>Após esse tempo o fluxo prosseguirá.</span>
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.wait}
      label={data.label}
      subtitle={tempoTexto}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
