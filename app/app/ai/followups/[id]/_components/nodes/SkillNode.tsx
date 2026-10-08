"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { PuzzlePiece } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function SkillNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"skill">;
  const skillName = config?.skill_name || t("Nenhuma skill selecionada");

  const customPreview = (
    <div className="space-y-1.5 rounded-lg border border-cat-amber/30 bg-cat-amber-bg p-2.5 text-xs text-cat-amber-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <div className="flex items-center gap-1.5 truncate text-cat-amber-fg">
          <PuzzlePiece size={14} className="shrink-0 text-cat-amber" />
          <span className="truncate">{skillName}</span>
        </div>
        <span className="rounded-xs bg-cat-amber-bg px-1.5 py-0.5 text-[9px] font-mono font-medium text-cat-amber-fg shrink-0">
          {t("Skill Ativa")}
        </span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.skill}
      label={data.label}
      subtitle={describeNodeConfig("skill", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "skill", config: data.config as ConfigOf<"skill"> })}
    />
  );
}
