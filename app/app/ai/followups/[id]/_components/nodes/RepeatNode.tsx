"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { ArrowsClockwise, ArrowBendUpLeft, Check } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function RepeatNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"repeat">;
  const max = config?.max_count ?? 3;

  const customPreview = (
    <div className="space-y-1.5 rounded-lg border border-teal-200 bg-teal-50/60 p-2.5 text-xs text-teal-950 shadow-2xs dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-200">
      <div className="flex items-center justify-between font-semibold">
        <div className="flex items-center gap-1.5 text-teal-800 dark:text-teal-300">
          <ArrowsClockwise size={14} className="shrink-0 animate-spin-slow" />
          <span>{t("Ciclo de Repetição")}</span>
        </div>
        <span className="rounded-xs bg-teal-200/80 dark:bg-teal-900/60 px-1.5 py-0.5 text-[10px] font-mono font-bold text-teal-900 dark:text-teal-200">
          {t("Até")} {max}x
        </span>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-teal-200/60 dark:border-teal-900/40 text-[10px] text-teal-700/80 dark:text-teal-400">
        <span className="flex items-center gap-1">
          <ArrowBendUpLeft size={11} /> {t("Volta")} &lt; {max}
        </span>
        <span className="flex items-center gap-1">
          <Check size={11} /> {t("Fim")} &gt;= {max}
        </span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.repeat}
      label={data.label}
      subtitle={describeNodeConfig("repeat", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "repeat", config: data.config as ConfigOf<"repeat"> })}
    />
  );
}
