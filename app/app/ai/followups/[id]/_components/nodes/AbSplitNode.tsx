"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { GitBranch } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

const BRANCH_COLORS = [
  "bg-cat-pink text-cat-pink-fg",
  "bg-cat-violet text-cat-violet-fg",
  "bg-cat-teal text-cat-teal-fg",
  "bg-cat-amber text-cat-amber-fg",
  "bg-cat-violet text-cat-violet-fg",
  "bg-cat-green text-cat-green-fg",
];

const BAR_COLORS = [
  "bg-cat-pink",
  "bg-cat-violet",
  "bg-cat-teal",
  "bg-cat-amber",
  "bg-cat-violet",
  "bg-cat-green",
];

export function AbSplitNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"ab_split">;
  const branches: Array<{ id: string; label: string; percent: number }> = config?.branches || [
    { id: "a", label: "A", percent: 50 },
    { id: "b", label: "B", percent: 50 },
  ];

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-cat-pink/30 bg-cat-pink-bg p-2.5 text-xs text-cat-pink-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <div className="flex items-center gap-1.5 text-cat-pink-fg">
          <GitBranch size={14} className="shrink-0" />
          <span>{t("Divisão A/B")}</span>
        </div>
        <span className="rounded-xs bg-cat-pink-bg px-1.5 py-0.5 text-[10px] font-medium text-cat-pink-fg">
          {branches.length} {t("caminhos")}
        </span>
      </div>

      {/* Barra de Proporção Multi-Segmentada */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
        {branches.map((b, i) => (
          <div
            key={b.id}
            title={`${b.label}: ${b.percent}%`}
            style={{ width: `${b.percent}%` }}
            className={`h-full transition-all ${BAR_COLORS[i % BAR_COLORS.length]}`}
          />
        ))}
      </div>

      {/* Lista de Caminhos e Porcentagens */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
        {branches.map((b, i) => (
          <div
            key={b.id}
            className="flex items-center gap-1 rounded-md bg-white/80 px-1.5 py-0.5 font-mono shadow-2xs border border-cat-pink/30"
          >
            <div className={`h-1.5 w-1.5 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
            <span className="font-semibold text-text">{b.label}:</span>
            <span className="font-bold text-text">{b.percent}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.ab_split}
      label={data.label}
      subtitle={describeNodeConfig("ab_split", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
      branches={nodeBranches({ type: "ab_split", config: data.config as ConfigOf<"ab_split"> })}
    />
  );
}
