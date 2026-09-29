"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { ICONES_DE_ITEM_DE_CONTEUDO, NODE_VISUALS, describeNodeConfig, descreverItemDeConteudo } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ActionNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { mode: string }>;
  const isContentMode = config.mode === "content";
  const previewRows =
    isContentMode
      ? config.items.map((item) => ({
          type: item.type,
          Icon: ICONES_DE_ITEM_DE_CONTEUDO[item.type],
          texto: descreverItemDeConteudo(item, t),
        }))
      : undefined;

  let customPreview: React.ReactNode = undefined;
  const rawMode = (config as { mode?: string }).mode;
  if (rawMode === "tag") {
    const tagName = (config as any).tag || "Entrou no funil";
    const op = (config as any).op === "remove" ? "Remover etiqueta" : "Adicionar etiqueta";
    customPreview = (
      <div className="flex items-center gap-2 p-1">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-400 text-[10px] leading-none text-slate-500 font-bold">
            +
          </span>
          {op}
        </span>
        <span className="rounded-full bg-[#2563eb] px-2.5 py-0.5 text-[10px] font-bold text-white shadow-xs">
          {tagName}
        </span>
      </div>
    );
  }

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
      customPreview={customPreview}
    />
  );
}
