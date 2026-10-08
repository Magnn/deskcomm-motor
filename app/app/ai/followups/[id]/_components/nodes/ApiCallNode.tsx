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
  const hasActions = Boolean(config.actions && config.actions.length > 0);
  const isCustomUrl = Boolean(config.url && config.url !== "https://example.com/webhook");

  const actionText = firstAction?.label
    ? `${firstAction.label}${config.actions && config.actions.length > 1 ? ` (+${config.actions.length - 1})` : ""}`
    : isCustomUrl
      ? `${config.method} ${config.url}`
      : "API Request";

  const customPreview = hasActions ? (
    <div className="flex items-center gap-2 p-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
        <span className="flex h-4 w-4 items-center justify-center rounded-full border border-border-strong text-[10px] leading-none text-text-muted font-bold">
          +
        </span>
        {t("Executar ação")}
      </span>
      <span className="max-w-[150px] truncate rounded-full bg-[#9333ea] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
        {actionText}
      </span>
    </div>
  ) : (
    <div className="flex items-center gap-2 p-1">
      <span className="inline-flex items-center rounded-md bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider border border-purple-200 dark:border-purple-800">
        {config.method || "GET"}
      </span>
      <span className="max-w-[170px] truncate font-mono text-[11px] text-text-muted">
        {isCustomUrl ? config.url : t("Adicionar requisição")}
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
