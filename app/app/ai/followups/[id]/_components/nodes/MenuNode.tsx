"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function MenuNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"menu">;
  
  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.menu}
      label={data.label}
      subtitle={describeNodeConfig("menu", config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      previewRows={[{ Icon: NODE_VISUALS.menu.icon, texto: config.prompt }]}
      branches={nodeBranches({ type: "menu", config })}
    />
  );
}
