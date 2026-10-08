"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { WhatsappTemplateConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { WhatsappLogo, Clock, CheckCircle } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function WhatsappTemplateNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as WhatsappTemplateConfig;

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-emerald-900/40 dark:from-emerald-950/20 dark:to-neutral-900">
      {/* Topo com Logo WhatsApp + Status Aprovado */}
      <div className="flex items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
          <WhatsappLogo size={14} weight="fill" className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="truncate">{t("Template HSM")}</span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-emerald-100/90 px-2 py-0.5 text-[9.5px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200 shrink-0">
          <CheckCircle size={10} weight="fill" />
          <span>{t("Meta Cloud")}</span>
        </div>
      </div>

      {/* Nome do Template Aprovado */}
      <div className="rounded-lg border border-emerald-200/60 bg-surface px-2.5 py-1.5 font-mono text-[11px] font-semibold text-emerald-900 shadow-2xs dark:border-emerald-800/40 dark:text-emerald-200 truncate">
        {config.template_name || t("Nenhum template selecionado")}
      </div>

      {/* Rodapé com Timeout */}
      <div className="flex items-center justify-between text-[10.5px] text-text-muted px-0.5">
        <span className="flex items-center gap-1">
          <Clock size={12} className="shrink-0 text-emerald-600" />
          <span>
            {t("Expira em")}: <strong className="text-text-muted">{config.timeout} {t(config.timeout_unit || "Minutos")}</strong>
          </span>
        </span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.whatsapp_template}
      label={data.label}
      subtitle={describeNodeConfig("whatsapp_template", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
