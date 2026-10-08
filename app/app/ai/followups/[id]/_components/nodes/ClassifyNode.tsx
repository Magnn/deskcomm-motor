"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Sparkle, Clock, ChatCircle, Lightbulb } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ClassifyNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"ai_classify">;
  const classes = config.classes || [];
  const graceMinutes = Math.round((config.grace_timeout_ms || 1_800_000) / 60_000);
  const targetLabel =
    config.target === "summary"
      ? t("Resumo da conversa")
      : t("Última resposta");

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/60 to-white p-2.5 text-xs shadow-2xs dark:border-violet-900/40 dark:from-violet-950/20 dark:to-neutral-900">
      {/* Topo informativo do classificador */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-violet-700 dark:text-violet-300">
          <Sparkle size={13} weight="fill" className="text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="truncate">{targetLabel}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-violet-100/80 px-2 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-900/60 dark:text-violet-200 shrink-0">
          <Clock size={11} className="shrink-0" />
          <span>{graceMinutes >= 60 ? `${(graceMinutes / 60).toFixed(0)}h` : `${graceMinutes}m`}</span>
        </div>
      </div>

      {/* Lista de classes / intenções em badges */}
      <div className="flex flex-wrap gap-1">
        {classes.length === 0 ? (
          <span className="text-[11px] text-text-subtle italic">
            {t("Nenhuma classe configurada")}
          </span>
        ) : (
          classes.slice(0, 4).map((cls, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-surface px-2 py-0.5 text-[10px] font-bold text-violet-900 shadow-2xs dark:border-violet-800/60 dark:text-violet-200"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
              <span className="truncate max-w-[110px]">{cls}</span>
            </span>
          ))
        )}
        {classes.length > 4 && (
          <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[9.5px] font-bold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
            +{classes.length - 4}
          </span>
        )}
      </div>

      {/* Dica da instrução (se houver) */}
      {config.hint && (
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-2 py-1 text-[10px] text-text-muted">
          <Lightbulb size={11} className="text-amber-500 shrink-0" />
          <span className="truncate italic">{config.hint}</span>
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.ai_classify}
      label={data.label}
      subtitle={describeNodeConfig("ai_classify", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "ai_classify", config })}
    />
  );
}
