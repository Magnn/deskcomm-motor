"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { Note } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AddNoteNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<RFNode["data"]["config"], { body: string }>;
  const bodyText = config.body || t("Clique para adicionar nota interna...");

  const customPreview = (
    <div className="space-y-1.5 rounded-lg border border-cat-amber/30 bg-cat-amber-bg p-2.5 text-xs text-cat-amber-fg shadow-2xs">
      <div className="flex items-center justify-between text-[11px] font-semibold text-cat-amber-fg">
        <div className="flex items-center gap-1.5">
          <Note size={14} className="text-cat-amber shrink-0" />
          <span>{t("Nota Interna")}</span>
        </div>
        <span className="rounded-xs bg-cat-amber-bg px-1 py-0.5 text-[9px] font-medium text-cat-amber-fg">
          {t("Privada")}
        </span>
      </div>

      <p className="line-clamp-3 text-[11px] italic leading-relaxed text-cat-amber-fg">
        "{bodyText}"
      </p>
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
      customPreview={customPreview}
    />
  );
}
