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
    <div className="space-y-2 rounded-lg border border-cat-amber/30 bg-cat-amber-bg p-2.5 text-xs text-cat-amber-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5 text-cat-amber-fg">
          <Target size={14} className="text-cat-amber shrink-0" />
          <span>{config.event_type || t("Evento")}</span>
        </span>
        {config.item_value && (
          <span className="rounded-md bg-cat-amber-bg px-1.5 py-0.5 font-bold text-cat-amber-fg">
            {config.currency || "BRL"} {config.item_value}
          </span>
        )}
      </div>
      <div className="text-[11px] text-cat-amber-fg truncate">
        {config.pixel_id ? `Pixel: ${config.pixel_id}` : t("Pixel não selecionado")}
      </div>
      {config.page_id && (
        <div className="text-[11px] text-cat-amber-fg truncate">
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
