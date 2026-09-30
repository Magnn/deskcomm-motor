"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

/**
 * A prévia mostra SÓ o que está na configuração. Já mostrou um modelo, uma
 * temperatura e um "Erro ao gerar mensagem" fixos — cópia de um mock —, e quem
 * olhava o card lia como estado real do nó.
 */
export function AiGenericNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"ai_generic">;

  const parametros = [
    config.modelo_gpt ? `${t("Modelo")}: ${config.modelo_gpt}` : null,
    config.temperature !== undefined ? `${t("Temperatura")}: ${config.temperature}` : null,
  ].filter((p): p is string => p !== null);

  const customPreview = (
    <div className="flex w-full flex-col gap-1.5 rounded-lg border border-border/60 bg-surface-elevated p-2">
      <div className="text-[10px] font-medium text-text-muted">{t("Prompt a ser executado:")}</div>
      <div className="line-clamp-3 rounded-lg border border-border bg-surface p-2 text-[11px] leading-relaxed text-text">
        {config.prompt}
      </div>
      {parametros.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {parametros.map((p) => (
            <span key={p} className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-bold text-accent">
              {p}
            </span>
          ))}
        </div>
      )}
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
