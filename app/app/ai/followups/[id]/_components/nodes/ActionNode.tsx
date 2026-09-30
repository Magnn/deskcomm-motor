"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { ChatCircle, Sparkle, FileText, Tag, Plus, Trash } from "@/lib/ui/icons";
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
    const isRemove = (config as any).op === "remove";
    const op = isRemove ? t("Remover etiqueta") : t("Adicionar etiqueta");
    customPreview = (
      <div className="flex items-center gap-2 rounded-xl border border-blue-200/80 bg-blue-50/50 p-2 text-xs dark:border-blue-900/40 dark:bg-blue-950/20">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] leading-none text-white font-bold">
            {isRemove ? <Trash size={10} /> : <Plus size={10} />}
          </span>
          <span className="text-[11px]">{op}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-2xs">
          <Tag size={10} weight="fill" />
          <span className="truncate max-w-[110px]">{tagName}</span>
        </span>
      </div>
    );
  } else if (rawMode === "text") {
    const bodyText = (config as any).body || "";
    customPreview = (
      <div className="flex w-full flex-col gap-1.5 rounded-xl border border-blue-200/80 bg-gradient-to-b from-blue-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-blue-900/40 dark:from-blue-950/20 dark:to-neutral-900">
        <div className="flex items-center gap-1.5 font-bold text-blue-800 dark:text-blue-300 text-[11px]">
          <ChatCircle size={13} weight="fill" className="shrink-0 text-blue-600 dark:text-blue-400" />
          <span>{t("Mensagem de Texto")}</span>
        </div>
        <p className="line-clamp-2 rounded-lg border border-blue-100 bg-white p-2 text-[10.5px] italic text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 leading-snug">
          "{bodyText}"
        </p>
      </div>
    );
  } else if (rawMode === "ai_message") {
    const promptHint = (config as any).prompt_hint || "";
    customPreview = (
      <div className="flex w-full flex-col gap-1.5 rounded-xl border border-violet-200/80 bg-gradient-to-b from-violet-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-violet-900/40 dark:from-violet-950/20 dark:to-neutral-900">
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-violet-800 dark:text-violet-300">
            <Sparkle size={13} weight="fill" className="shrink-0 text-violet-600 dark:text-violet-400" />
            <span>{t("Mensagem IA")}</span>
          </div>
          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            {t("Dinâmica")}
          </span>
        </div>
        <p className="line-clamp-2 rounded-lg border border-violet-100 bg-white p-2 text-[10.5px] italic text-neutral-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300 leading-snug">
          "{promptHint}"
        </p>
      </div>
    );
  } else if (rawMode === "template") {
    customPreview = (
      <div className="flex w-full flex-col gap-1.5 rounded-xl border border-neutral-200 bg-white p-2.5 text-xs shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-1.5 font-bold text-neutral-800 dark:text-neutral-200 text-[11px]">
          <FileText size={14} className="shrink-0 text-blue-600" />
          <span>{t("Modelo Cadastrado")}</span>
        </div>
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
