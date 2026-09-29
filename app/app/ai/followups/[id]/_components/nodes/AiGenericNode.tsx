"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AiGenericNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { prompt: string }>;
  const prompt = config.prompt || "Resuma em uma frase o que o cliente disse sobre a necessidade dele.";

  const customPreview = (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-slate-100 bg-white p-2 dark:border-border/60 dark:bg-surface-elevated">
      <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Prompt a ser executado:</div>
      <div className="line-clamp-3 rounded-lg border border-slate-200 bg-slate-100 p-2 text-[11px] leading-relaxed text-slate-700 dark:border-border dark:bg-surface dark:text-slate-200">
        {prompt}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
        <span className="rounded-full bg-[#10b981] px-2 py-0.5 text-[9px] font-bold text-white shadow-2xs">
          Modelo: gemini-2.5-flash
        </span>
        <span className="rounded-full bg-[#10b981] px-2 py-0.5 text-[9px] font-bold text-white shadow-2xs">
          Temperatura: 0.1
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 border-t border-slate-100 pt-1 text-[10px] font-semibold text-red-500 dark:border-border/60">
        <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
        <span>Erro ao gerar mensagem</span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.ai_generic}
      label={data.label}
      subtitle={describeNodeConfig("ai_generic", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
