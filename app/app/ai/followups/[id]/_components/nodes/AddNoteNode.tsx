"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AddNoteNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { body: string }>;
  const bodyText = config.body || "Clique para adicionar nota...";

  const customPreview = (
    <div className="line-clamp-4 rounded-lg border border-yellow-200 bg-yellow-50 p-2.5 text-xs font-medium leading-relaxed whitespace-pre-wrap text-yellow-900 italic shadow-2xs dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
      {bodyText}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.add_note}
      label={data.label}
      subtitle={describeNodeConfig("add_note", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
