"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Info } from "lucide-react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { Play } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function ConditionNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"condition">;
  const checks = config.checks || [];
  const combinator = config.combinator || "and";
  const isPerCheck = config.branching === "per_check";

  const logicText =
    combinator === "or"
      ? t("Pelo menos uma das condições é verdadeira")
      : t("Todas as condições são verdadeiras");

  // Visual Idêntico ao AcassIA para o nó Condição binário (Verdadeiro / Não cumprida)
  const customPreview = !isPerCheck ? (
    <div className="flex w-full flex-col gap-2.5 font-sans">
      {/* Box 1: Lógica do combinador + Handle Verdadeiro (Roxo) */}
      <div className="relative rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 text-center">
        <p className="text-[12px] font-bold text-slate-700 dark:text-zinc-200 leading-snug">
          {logicText}
        </p>
        <Handle
          type="source"
          id="true"
          position={Position.Right}
          className="!-right-[13.5px] !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#4f46e5] !shadow-xs text-white hover:!scale-125 transition-all"
          data-testid={`node-branch-${id}-true`}
        >
          <Play size={8} weight="fill" className="text-white ml-0.5 pointer-events-none" />
        </Handle>
      </div>

      {/* Box 2: Condições verificadas + Badge azul */}
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-center flex flex-col items-center gap-2">
        {checks.length === 0 ? (
          <p className="text-xs text-slate-400">{t("Sem condições configuradas")}</p>
        ) : (
          checks.slice(0, 3).map((check, idx) => {
            const isTag = check.field === "tag";
            const checkTitle = isTag
              ? t("O contato possui a etiqueta")
              : `${t("O contato tem o campo")} ${check.field} ${check.op || "="}`;
            const badgeValue = String(check.value || (isTag ? "Tag" : "valor"));

            return (
              <div key={idx} className="flex flex-col items-center gap-1.5 w-full">
                <span className="text-xs font-medium text-slate-700 dark:text-zinc-300">
                  {checkTitle}
                </span>
                <span className="rounded-full bg-[#0055ff] text-white px-4 py-1 text-xs font-bold shadow-2xs max-w-[200px] truncate">
                  {badgeValue}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 dark:border-zinc-800" />

      {/* Linha Inferior: Condições não foram cumpridas + Handle Falso (Vermelho) */}
      <div className="relative rounded-lg bg-slate-100/90 dark:bg-zinc-900 px-3 py-2 flex items-center gap-2">
        <Info size={14} className="text-[#ef4444] shrink-0" />
        <span className="text-xs font-medium text-slate-600 dark:text-zinc-400 truncate">
          {t("Condições não foram cumpridas")}
        </span>
        <Handle
          type="source"
          id="false"
          position={Position.Right}
          className="!-right-[13.5px] !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#ef4444] !shadow-xs text-white hover:!scale-125 transition-all"
          data-testid={`node-branch-${id}-false`}
        >
          <Play size={8} weight="fill" className="text-white ml-0.5 pointer-events-none" />
        </Handle>
      </div>
    </div>
  ) : (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-slate-100 bg-white p-1.5 dark:border-border/60 dark:bg-surface-elevated">
      <div className="flex min-h-[40px] flex-col items-center gap-2 rounded-md border border-dashed border-[#ef4444]/40 bg-[#fff1f2] p-2.5 text-center dark:bg-red-950/20">
        <div className="w-full text-center text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300">
          {logicText}
        </div>
        <div className="flex w-full flex-col gap-1.5">
          {checks.length > 0 ? (
            checks.slice(0, 3).map((check, i) => (
              <div key={i} className="flex flex-col items-center justify-center gap-1">
                <div className="rounded-md border border-dashed border-slate-200 bg-white px-2 py-1 text-[10px] leading-snug font-medium text-slate-600 dark:border-border dark:bg-surface dark:text-slate-400">
                  Validar se o campo <span className="font-bold">{check.field}</span> é igual a
                </div>
                <div className="rounded-full bg-[#10b981] px-3 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                  {String(check.value || "vazio")}
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dotted px-2 py-1 text-[10px] text-slate-400">Sem condições</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.condition}
      label={data.label}
      subtitle={describeNodeConfig("condition", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      showSource={isPerCheck}
      branches={isPerCheck ? nodeBranches({ type: "condition", config }) : []}
    />
  );
}
