"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { Question, Tag, Clock, Check } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function CollectNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = (data.config || {}) as {
    key?: string;
    label?: string;
    question?: string;
    type?: string;
    required?: boolean;
    permite_correcao?: boolean;
  };

  const questionText = config.question || config.label || t("Enviar pergunta para o lead");
  const fieldKey = config.key || "resposta";
  const fieldType = config.type || "text";

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-orange-200/80 bg-gradient-to-b from-orange-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-orange-900/40 dark:from-orange-950/20 dark:to-neutral-900">
      {/* Topo com Tipo de Pergunta e Status */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-orange-800 dark:text-orange-300">
          <Question size={14} weight="fill" className="text-orange-600 dark:text-orange-400 shrink-0" />
          <span>{t("Pergunta Coletora")}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-orange-100/90 px-1.5 py-0.5 text-[9.5px] font-bold text-orange-800 dark:bg-orange-950/60 dark:text-orange-200 shrink-0 font-mono">
          {fieldType}
        </span>
      </div>

      {/* Balão com a pergunta */}
      <div className="rounded-lg border border-orange-200/60 bg-white p-2 text-[10.5px] leading-relaxed text-neutral-800 shadow-2xs dark:border-orange-800/40 dark:bg-neutral-950 dark:text-neutral-200">
        <p className="line-clamp-2 italic text-neutral-600 dark:text-neutral-300">
          "{questionText}"
        </p>
      </div>

      {/* Badges de Saída: Salvar em Campo + Confirmação */}
      <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
        <span className="inline-flex items-center gap-1 rounded-md bg-orange-100/80 px-1.5 py-0.5 font-mono font-semibold text-orange-800 dark:bg-orange-950 dark:text-orange-300 truncate max-w-[130px]">
          <Tag size={10} className="shrink-0" />
          <span>&#123;&#123;{fieldKey}&#125;&#125;</span>
        </span>

        {config.permite_correcao && (
          <span className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400 text-[9.5px]">
            <Check size={10} className="text-emerald-600" />
            <span>{t("Permite correção")}</span>
          </span>
        )}
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
