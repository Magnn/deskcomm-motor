"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Bell, Users, Sparkle } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function NotifyAgentNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as Extract<
    RFNode["data"]["config"],
    { message: string; modo?: "manual" | "automatico" }
  >;
  const messageText = config.message || t("Enviar mensagem para atendente.");
  const isAutomatic = config.modo === "automatico";

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-purple-200/80 bg-gradient-to-b from-purple-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-purple-900/40 dark:from-purple-950/20 dark:to-neutral-900">
      {/* Header com Modo de Notificação */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-purple-800 dark:text-purple-300">
          <Bell size={14} weight="fill" className="text-purple-600 dark:text-purple-400 shrink-0" />
          <span>{t("Notificar Equipe")}</span>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-purple-100/90 px-1.5 py-0.5 text-[9.5px] font-bold text-purple-800 dark:bg-purple-950/60 dark:text-purple-200 shrink-0">
          {isAutomatic ? <Users size={10} /> : <Sparkle size={10} />}
          <span>{isAutomatic ? t("Automático") : t("Manual")}</span>
        </span>
      </div>

      {/* Box com a mensagem interna */}
      <div className="rounded-lg border border-purple-200/60 bg-surface p-2 text-[11px] text-text shadow-2xs dark:border-purple-800/40">
        <p className="line-clamp-2 font-mono text-[10px] text-text-muted leading-snug">
          {messageText}
        </p>
      </div>

      {/* Rodapé: Aviso interno não visível ao lead */}
      <div className="flex items-center justify-between text-[9.5px] text-text-subtle px-0.5">
        <span>🔒 {t("Mensagem interna (privada)")}</span>
        <span className="font-semibold text-purple-600 dark:text-purple-400">{t("Sem pausa")}</span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.notify_agent}
      label={data.label}
      subtitle={describeNodeConfig("notify_agent", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
