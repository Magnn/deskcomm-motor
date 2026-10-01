"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Clock, UsersThree, UserCircle } from "@/lib/ui/icons";

import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function AttendantRouteNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"attendant_route">;
  const attendantCount = config.attendant_ids?.length ?? 0;
  const maxWait = config.max_wait_minutes ?? 30;

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-amber-900/40 dark:from-amber-950/20 dark:to-neutral-900">
      {/* Topo com Título e Regra de Fila */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-amber-800 dark:text-amber-300">
          <UsersThree size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t("Fila de Atendimento")}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-amber-100/90 px-1.5 py-0.5 text-[9.5px] font-bold text-amber-800 dark:bg-amber-950/60 dark:text-amber-200 shrink-0">
          <Clock size={10} />
          <span>{maxWait}{t("m máx")}</span>
        </span>
      </div>

      {/* Caixa de Atendentes Selecionados */}
      <div className="rounded-lg border border-amber-200/60 bg-white p-2 text-[10.5px] text-neutral-800 shadow-2xs dark:border-amber-800/40 dark:bg-neutral-950 dark:text-neutral-200">
        <div className="flex items-center justify-between">
          <span className="text-neutral-500 dark:text-neutral-400">
            {attendantCount > 0
              ? `${attendantCount} ${attendantCount === 1 ? t("atendente selecionado") : t("atendentes selecionados")}`
              : t("Todos os atendentes elegíveis")}
          </span>
          {config.auto_follow && (
            <span className="flex items-center gap-1 text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400" title={t("Mantém o atendente se já houver conversa prévia")}>
              <UserCircle size={11} />
              <span>{t("Seguidor")}</span>
            </span>
          )}
        </div>
      </div>

      {/* Rodapé com política Round-Robin */}
      <div className="flex items-center justify-between text-[9.5px] text-neutral-400 px-0.5">
        <span>🔄 {t("Distribuição alternada")}</span>
        <span className="font-semibold text-amber-700 dark:text-amber-300">Round-Robin</span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.attendant_route}
      label={data.label}
      subtitle={describeNodeConfig("attendant_route", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({
        type: "attendant_route",
        config,
      })}
    />
  );
}
