"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { VoiceStudioConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Microphone, SpeakerHigh } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function VoiceStudioNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as VoiceStudioConfig;

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-cat-violet/30 bg-cat-violet-bg p-2.5 text-xs text-cat-violet-fg shadow-2xs">
      <div className="flex items-center justify-between gap-1.5 font-semibold text-cat-violet-fg">
        <div className="flex items-center gap-1.5 truncate">
          <Microphone size={14} className="text-cat-violet shrink-0" />
          <span className="truncate">{config.voice_name || t("Julieta")}</span>
        </div>
        <span className="shrink-0 rounded-sm bg-cat-violet-bg px-1.5 py-0.5 text-[10px] font-medium text-cat-violet-fg">
          {config.send_as_voice_note ? t("Áudio gravado (PTT)") : t("Arquivo de áudio")}
        </span>
      </div>

      <p className="line-clamp-2 italic text-[11px] text-cat-violet-fg">
        {config.text ? `"${config.text}"` : t("Sem texto configurado")}
      </p>

      <div className="flex items-center justify-between border-t border-cat-violet/30 pt-1.5 text-[10px] text-cat-violet-fg">
        <div className="flex items-center gap-1">
          <SpeakerHigh size={11} className="shrink-0" />
          <span>{t("Vel")}: {config.speed?.toFixed(1).replace(".", ",")}x</span>
        </div>
        <span>{t("Estab")}: {config.stability?.toFixed(2).replace(".", ",")}</span>
        <span>{t("Sim")}: {config.similarity?.toFixed(2).replace(".", ",")}</span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.voice_studio}
      label={data.label}
      subtitle={describeNodeConfig("voice_studio", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
