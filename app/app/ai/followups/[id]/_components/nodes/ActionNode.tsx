"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { ICONES_DE_ITEM_DE_CONTEUDO, NODE_VISUALS, describeNodeConfig, descreverItemDeConteudo } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ActionNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { mode: string }>;
  const previewRows =
    config.mode === "content"
      ? config.items.map((item) => ({ Icon: ICONES_DE_ITEM_DE_CONTEUDO[item.type], texto: descreverItemDeConteudo(item, t) }))
      : undefined;
  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.action}
      label={data.label}
      subtitle={describeNodeConfig("action", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      previewRows={previewRows}
    />
  );
}
