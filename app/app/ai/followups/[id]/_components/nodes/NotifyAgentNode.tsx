"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Bell } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function NotifyAgentNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { message: string }>;
  const messageText = config.message || "Enviar mensagem para atendente.";

  const customPreview = (
    <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
      <Bell size={16} className="shrink-0 text-blue-600" aria-hidden />
      <span className="line-clamp-2 font-medium">{messageText}</span>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.notify_agent}
      label={data.label}
      subtitle={describeNodeConfig("notify_agent", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
