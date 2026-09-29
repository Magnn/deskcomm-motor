"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function CollectNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = (data.config || {}) as {
    key?: string;
    label?: string;
    question?: string;
    type?: string;
  };

  const questionText = config.question || config.label || "Enviar pergunta";
  const fieldKey = config.key || "resposta";

  const customPreview = (
    <div className="flex w-full flex-col gap-2">
      {/* Caixa de pergunta sombreada / pontilhada */}
      <div className="rounded-lg border border-dashed border-[#ea580c]/40 bg-[#fff7ed] p-2.5 text-xs font-medium text-slate-800 dark:bg-orange-950/20 dark:text-slate-200">
        <span className="line-clamp-3">{questionText}</span>
      </div>

      {/* Linhas de ação da pergunta estilo AcassIA */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-[11px] font-medium text-slate-700 dark:border-border dark:bg-surface dark:text-slate-300">
          <span className="truncate">agrupa 15s · salva em <code className="text-[#ea580c] font-semibold">{`{{${fieldKey}}}`}</code></span>
        </div>
        <div className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          <span>Se não responder em 1h</span>
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.collect}
      label={data.label || "Pergunta"}
      subtitle={describeNodeConfig("collect", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
