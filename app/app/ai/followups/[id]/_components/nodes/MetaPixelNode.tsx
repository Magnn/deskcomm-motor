"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { MetaPixelConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Target } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function MetaPixelNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as MetaPixelConfig;

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-950 shadow-2xs dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
          <Target size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{config.event_type || t("Evento")}</span>
        </span>
        {config.item_value && (
          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            R$ {config.item_value}
          </span>
        )}
      </div>
      <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80 truncate">
        {config.pixel_id ? `Pixel: ${config.pixel_id}` : t("Pixel não selecionado")}
      </div>
      {config.page_id && (
        <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80 truncate">
          Page ID: {config.page_id}
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.meta_pixel}
      label={data.label}
      subtitle={describeNodeConfig("meta_pixel", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
