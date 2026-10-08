"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { Sparkle, Tag, PaperPlaneTilt, Cpu } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AiGenericNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"ai_generic">;
  const prompt = config.prompt || t("Resuma em uma frase o que o cliente disse sobre a necessidade dele.");
  const modelName = config.modelo_gpt || "gpt-4o-mini";
  const saveKey =
    config.save_to?.kind === "contact_name"
      ? "nome_do_contato"
      : config.save_to?.kind === "lead_custom"
        ? config.save_to.key
        : null;

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-neutral-900">
      {/* Topo com Modelo e Status */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-cat-green-fg">
          <Sparkle size={14} weight="fill" className="text-cat-green shrink-0" />
          <span>{t("Prompt de IA (GPT)")}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-cat-green-bg px-1.5 py-0.5 text-[9.5px] font-bold text-cat-green-fg shrink-0 font-mono">
          <Cpu size={10} />
          <span>{modelName}</span>
        </span>
      </div>

      {/* Caixa do Prompt */}
      <div className="rounded-lg border border-cat-green/30 bg-surface p-2 text-[10.5px] leading-relaxed text-text shadow-2xs">
        <p className="line-clamp-2 italic text-text-muted">
          "{prompt}"
        </p>
      </div>

      {/* Badges de Saída: Salvar em Campo / Enviar ao Contato */}
      <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] pt-0.5">
        {saveKey && (
          <span className="inline-flex items-center gap-1 rounded-md bg-cat-green-bg px-1.5 py-0.5 font-mono font-semibold text-cat-green-fg truncate max-w-[130px]">
            <Tag size={10} className="shrink-0" />
            <span>&#123;&#123;{saveKey}&#125;&#125;</span>
          </span>
        )}

        {config.enviar_resultado_texto && (
          <span className="inline-flex items-center gap-1 rounded-md bg-cat-blue-bg px-1.5 py-0.5 font-semibold text-cat-blue-fg shrink-0">
            <PaperPlaneTilt size={10} />
            <span>{t("Envia resposta")}</span>
          </span>
        )}

        {config.temperature !== undefined && (
          <span className="text-text-subtle text-[9.5px] ml-auto">
            temp: {config.temperature}
          </span>
        )}
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
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
