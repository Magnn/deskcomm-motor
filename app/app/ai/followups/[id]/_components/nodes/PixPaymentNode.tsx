"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { PixPaymentConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { CreditCard } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function PixPaymentNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as PixPaymentConfig;

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs text-emerald-950 shadow-2xs dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-200">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5">
          <CreditCard size={14} className="text-emerald-600 dark:text-emerald-400" />
          <span>PIX ({config.key_type || "aleatória"})</span>
        </span>
        {config.amount && (
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300">
            R$ {config.amount}
          </span>
        )}
      </div>
      {config.pix_key ? (
        <div className="font-mono text-[11px] truncate text-emerald-800 dark:text-emerald-300" title={config.pix_key}>
          {config.pix_key}
        </div>
      ) : (
        <div className="text-[11px] italic text-emerald-600/80 dark:text-emerald-400/80">
          {t("Chave PIX não configurada")}
        </div>
      )}
      {config.beneficiary && (
        <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 truncate">
          {t("Favorecido")}: {config.beneficiary}
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.pix_payment}
      label={data.label}
      subtitle={describeNodeConfig("pix_payment", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
