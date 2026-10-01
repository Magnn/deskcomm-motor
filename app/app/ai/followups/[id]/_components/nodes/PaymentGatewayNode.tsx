"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { PaymentGatewayConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { CreditCard } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function PaymentGatewayNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as PaymentGatewayConfig;

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/50 p-2.5 text-xs text-purple-950 shadow-2xs dark:border-purple-800 dark:bg-purple-950/20 dark:text-purple-200">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5">
          <CreditCard size={14} className="text-purple-600 dark:text-purple-400" />
          <span>{config.currency || "BRL"}</span>
        </span>
        <span className="rounded-md bg-purple-100 px-1.5 py-0.5 font-bold text-purple-800 dark:bg-purple-900/50 dark:text-purple-300">
          {config.open_amount ? t("Valor aberto") : `${config.currency || "BRL"} ${config.amount || "0,00"}`}
        </span>
      </div>
      <div className="text-[11px] text-purple-700/80 dark:text-purple-300/80 truncate">
        {t("Cliente")}: {config.customer_name || "{full_name}"} ({config.customer_phone || "{phone_number}"})
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.payment_gateway}
      label={data.label}
      subtitle={describeNodeConfig("payment_gateway", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
