"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { CheckCircle, Warning, Sparkle } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function EndNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"end">;
  const outcome = (config?.outcome || "converted") as "converted" | "exhausted" | "custom";

  const outcomeConfig = {
    converted: {
      label: t("Convertido"),
      icon: CheckCircle,
      badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
      desc: t("Meta concluída com sucesso"),
    },
    exhausted: {
      label: t("Esgotado"),
      icon: Warning,
      badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800",
      desc: t("Tentativas finalizadas"),
    },
    custom: {
      label: t("Personalizado"),
      icon: Sparkle,
      badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-800",
      desc: t("Desfecho customizado"),
    },
  }[outcome] || {
    label: t("Concluído"),
    icon: CheckCircle,
    badgeClass: "bg-surface-elevated text-text border-border-strong",
    desc: t("Fim"),
  };

  const Icon = outcomeConfig.icon;

  const customPreview = (
    <div className="space-y-1.5 rounded-lg border border-border bg-surface-elevated p-2.5 text-xs text-text shadow-2xs">
      <div className="flex items-center justify-between gap-1.5 font-semibold">
        <div className="flex items-center gap-1.5 truncate">
          <Icon size={14} className="shrink-0" />
          <span className="truncate">{outcomeConfig.label}</span>
        </div>
        <span className={`shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] font-medium ${outcomeConfig.badgeClass}`}>
          {outcomeConfig.desc}
        </span>
      </div>

      {config?.note && (
        <p className="line-clamp-2 italic text-[11px] text-text-muted border-t border-border pt-1">
          "{config.note}"
        </p>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.end}
      label={data.label}
      subtitle={describeNodeConfig("end", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      showSource={false}
    />
  );
}
