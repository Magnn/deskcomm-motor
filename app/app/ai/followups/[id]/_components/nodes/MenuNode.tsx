"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { ListChecks, Clock } from "@/lib/ui/icons";

import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function MenuNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"menu">;
  const options = config.options || [];
  const promptText = config.prompt?.trim() || t("Selecione uma das opções:");

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-sky-200/80 bg-gradient-to-b from-sky-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-sky-900/40 dark:from-sky-950/20 dark:to-neutral-900">
      {/* Título do Menu */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-sky-800 dark:text-sky-300">
          <ListChecks size={14} className="text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{t("Menu de Opções")}</span>
        </div>
        {config.expiracao_tempo && (
          <span className="flex items-center gap-1 rounded-full bg-sky-100/90 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200 shrink-0">
            <Clock size={10} className="shrink-0" />
            <span>{config.expiracao_tempo} {config.expiracao_unidade || "h"}</span>
          </span>
        )}
      </div>

      {/* Mensagem prompt do Menu */}
      <div className="rounded-lg border border-sky-200/60 bg-surface p-2 text-[11px] text-text shadow-2xs dark:border-sky-800/40">
        <p className="line-clamp-2 italic text-text-muted">
          "{promptText}"
        </p>
      </div>

      {/* Lista de Botões de Opção (estilo WhatsApp) */}
      <div className="flex flex-col gap-1">
        {options.slice(0, 3).map((option, idx) => (
          <div
            key={option.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2 py-1 text-[10.5px] font-semibold text-sky-900 shadow-2xs dark:text-sky-200"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[9.5px] font-bold text-sky-700 dark:bg-sky-900 dark:text-sky-300">
              {idx + 1}
            </span>
            <span className="truncate">{option.label}</span>
          </div>
        ))}
        {options.length > 3 && (
          <div className="text-center text-[9.5px] font-semibold text-sky-600 dark:text-sky-400">
            +{options.length - 3} {t("outras opções")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.menu}
      label={data.label}
      subtitle={describeNodeConfig("menu", config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "menu", config })}
    />
  );
}
