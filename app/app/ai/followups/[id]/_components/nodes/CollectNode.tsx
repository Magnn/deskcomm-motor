"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

/**
 * Agrupamento e prazo saem da configuração do nó. Já disseram "agrupa 15s" e
 * "Se não responder em 1h" fixos, com qualquer valor salvo.
 */
export function CollectNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"collect">;

  const questionText = config.question || config.label || t("Enviar pergunta");
  const agrupa = config.agrupar_respostas_segundos;
  const expira =
    config.expiracao_tempo !== undefined
      ? `${config.expiracao_tempo} ${t(config.expiracao_unidade ?? "minutos")}`
      : null;

  const customPreview = (
    <div className="flex w-full flex-col gap-2">
      <div className="rounded-lg border border-dashed border-warning/50 bg-warning-bg p-2.5 text-xs font-medium text-text">
        <span className="line-clamp-3">{questionText}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-surface-elevated px-2.5 py-1.5 text-[11px] font-medium text-text">
          <span className="truncate">
            {agrupa ? `${t("agrupa")} ${agrupa}s · ` : ""}
            {t("salva em")} <code className="font-semibold text-accent">{`{{${config.key}}}`}</code>
          </span>
        </div>
        {expira && (
          <div className="flex items-center gap-1.5 px-1 text-[10px] font-medium text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-error" />
            <span>{`${t("Se não responder em")} ${expira}`}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.collect}
      label={data.label || t("Pergunta")}
      subtitle={describeNodeConfig("collect", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
