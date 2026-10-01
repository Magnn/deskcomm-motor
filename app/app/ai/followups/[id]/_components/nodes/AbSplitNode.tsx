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
  "bg-pink-500 text-pink-700 dark:text-pink-300",
  "bg-indigo-500 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500 text-teal-700 dark:text-teal-300",
  "bg-amber-500 text-amber-700 dark:text-amber-300",
  "bg-purple-500 text-purple-700 dark:text-purple-300",
  "bg-emerald-500 text-emerald-700 dark:text-emerald-300",
];

const BAR_COLORS = [
  "bg-pink-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-emerald-500",
];

export function AbSplitNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"ab_split">;
  const branches: Array<{ id: string; label: string; percent: number }> = config?.branches || [
    { id: "a", label: "A", percent: 50 },
    { id: "b", label: "B", percent: 50 },
  ];

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-pink-200 bg-pink-50/50 p-2.5 text-xs text-pink-950 shadow-2xs dark:border-pink-900/60 dark:bg-pink-950/20 dark:text-pink-200">
      <div className="flex items-center justify-between font-semibold">
        <div className="flex items-center gap-1.5 text-pink-800 dark:text-pink-300">
          <GitBranch size={14} className="shrink-0" />
          <span>{t("Divisão A/B")}</span>
        </div>
        <span className="rounded-xs bg-pink-200/80 dark:bg-pink-900/60 px-1.5 py-0.5 text-[10px] font-medium text-pink-900 dark:text-pink-300">
          {branches.length} {t("caminhos")}
        </span>
      </div>

      {/* Barra de Proporção Multi-Segmentada */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-zinc-800">
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
            className="flex items-center gap-1 rounded-md bg-white/80 dark:bg-zinc-900/80 px-1.5 py-0.5 font-mono shadow-2xs border border-pink-200/60 dark:border-pink-900/40"
          >
            <div className={`h-1.5 w-1.5 rounded-full ${BAR_COLORS[i % BAR_COLORS.length]}`} />
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">{b.label}:</span>
            <span className="font-bold text-neutral-900 dark:text-neutral-100">{b.percent}%</span>
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
