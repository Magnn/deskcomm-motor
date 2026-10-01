"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { ExecuteCodeConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Code } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ExecuteCodeNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ExecuteCodeConfig;

  const codeSnippet = config.code ? config.code.split("\n")[0]?.slice(0, 35) : "";

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-950 shadow-2xs dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5">
          <Code size={14} className="text-amber-600 dark:text-amber-400" />
          <span>{t("Executar JavaScript")}</span>
        </span>
        <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
          {config.timeout_ms || 3000}ms
        </span>
      </div>

      <div className="rounded-md border border-amber-200/60 bg-amber-100/40 p-1.5 font-mono text-[10px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-300 truncate">
        {codeSnippet || "return { status: 'ok' };"}
      </div>

      {config.mappings && config.mappings.length > 0 ? (
        <div className="text-[10px] text-amber-800 dark:text-amber-300">
          {config.mappings.length} {config.mappings.length === 1 ? t("campo mapeado") : t("campos mapeados")}
        </div>
      ) : config.output_field ? (
        <div className="text-[10px] text-amber-800 dark:text-amber-300 truncate">
          {t("Salvar em")}: <span className="font-mono">{config.output_field}</span>
        </div>
      ) : (
        <div className="text-[10px] italic text-amber-700/70 dark:text-amber-400/70">
          {t("Sem mapeamento de retorno")}
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.execute_code}
      label={data.label}
      subtitle={describeNodeConfig("execute_code", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
