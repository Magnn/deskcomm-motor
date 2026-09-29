"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ConditionNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"condition">;
  const checks = config.checks || [];
  const combinator = config.combinator || "and";
  const logicText = combinator === "or" ? "Qualquer condição é verdadeira:" : "Todas as condições são verdadeiras:";

  const customPreview = (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-slate-100 bg-white p-1.5 dark:border-border/60 dark:bg-surface-elevated">
      <div className="flex min-h-[40px] flex-col items-center gap-2 rounded border border-dashed border-[#ef4444]/40 bg-[#fff1f2] p-2.5 text-center dark:bg-red-950/20">
        <div className="w-full text-center text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
          {logicText}
        </div>
        <div className="flex w-full flex-col gap-1.5">
          {checks.length > 0 ? (
            checks.slice(0, 2).map((check, i) => (
              <div key={i} className="flex flex-col items-center justify-center gap-1">
                <div className="rounded border border-dashed border-slate-200 bg-white px-2 py-1 text-[10px] leading-snug font-medium text-slate-600 dark:border-border dark:bg-surface dark:text-slate-400">
                  Validar se o campo <span className="font-bold">{check.field}</span> é igual a
                </div>
                <div className="rounded-full bg-[#10b981] px-3 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                  {String(check.value || "vazio")}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded border border-dotted px-2 py-1 text-[10px] text-slate-400">Sem condições</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.condition}
      label={data.label}
      subtitle={describeNodeConfig("condition", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "condition", config })}
    />
  );
}
