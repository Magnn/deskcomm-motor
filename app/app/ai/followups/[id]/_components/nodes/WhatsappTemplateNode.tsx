"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { WhatsappTemplateConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { ChatCircle, Clock } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function WhatsappTemplateNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as WhatsappTemplateConfig;

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-xs text-blue-950 shadow-2xs dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
      <div className="flex items-center gap-1.5 font-semibold text-blue-800 dark:text-blue-300">
        <ChatCircle size={14} className="text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="truncate">{config.template_name || t("Selecione um template")}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-blue-700/80 dark:text-blue-300/80">
        <Clock size={12} className="shrink-0" />
        <span>
          {t("Timeout")}: {config.timeout} {t(config.timeout_unit || "Minutos")}
        </span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.whatsapp_template}
      label={data.label}
      subtitle={describeNodeConfig("whatsapp_template", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
