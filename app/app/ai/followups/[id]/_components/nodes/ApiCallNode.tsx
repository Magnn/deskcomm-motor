"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Play } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ApiCallNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { method: string; url: string }> & {
    actions?: Array<{ label?: string; type?: string }>;
  };
  const firstAction = config.actions?.[0];
  const actionText = firstAction?.label
    ? `${firstAction.label}${config.actions && config.actions.length > 1 ? ` (+${config.actions.length - 1})` : ""}`
    : config.url && config.url !== "https://example.com/webhook"
      ? `${config.method} ${config.url}`
      : "Executar ação";

  const customPreview = (
    <div className="flex items-center gap-2 p-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] leading-none text-slate-500 font-bold">
          +
        </span>
        Executar ação
      </span>
      <span className="max-w-[150px] truncate rounded-full bg-[#2563eb] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
        {actionText}
      </span>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.api_call}
      label={data.label}
      subtitle={describeNodeConfig("api_call", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
