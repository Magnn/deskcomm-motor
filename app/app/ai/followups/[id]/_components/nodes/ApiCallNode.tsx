"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Play } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ApiCallNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { method: string; url: string }>;
  const actionText = config.url ? `${config.method} ${config.url}` : "Executar ação";

  const customPreview = (
    <div className="flex min-h-[38px] items-center justify-center rounded-lg border border-[#2d336b]/20 bg-slate-50 p-2.5 text-center dark:bg-surface-elevated">
      <div className="flex items-center gap-1.5 rounded-full bg-[#10b981] px-3 py-1 text-xs font-bold text-white shadow-2xs">
        <Play size={10} weight="fill" className="shrink-0" />
        <span className="max-w-[200px] truncate">{actionText}</span>
      </div>
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
