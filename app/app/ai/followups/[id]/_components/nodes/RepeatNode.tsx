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
    <div className="space-y-1.5 rounded-lg border border-cat-teal/30 bg-cat-teal-bg p-2.5 text-xs text-cat-teal-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <div className="flex items-center gap-1.5 text-cat-teal-fg">
          <ArrowsClockwise size={14} className="shrink-0 animate-spin-slow" />
          <span>{t("Ciclo de Repetição")}</span>
        </div>
        <span className="rounded-xs bg-cat-teal-bg px-1.5 py-0.5 text-[10px] font-mono font-bold text-cat-teal-fg">
          {t("Até")} {max}x
        </span>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-cat-teal/30 text-[10px] text-cat-teal-fg">
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
