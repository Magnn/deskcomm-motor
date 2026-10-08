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
    <div className="space-y-2 rounded-lg border border-cat-green/30 bg-cat-green-bg p-2.5 text-xs text-cat-green-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5">
          <CreditCard size={14} className="text-cat-green" />
          <span>PIX ({config.key_type || t("aleatória")})</span>
        </span>
        {config.amount && (
          <span className="rounded-md bg-cat-green-bg px-1.5 py-0.5 font-bold text-cat-green-fg">
            R$ {config.amount}
          </span>
        )}
      </div>
      {config.pix_key ? (
        <div className="font-mono text-[11px] truncate text-cat-green-fg" title={config.pix_key}>
          {config.pix_key}
        </div>
      ) : (
        <div className="text-[11px] italic text-cat-green">
          {t("Chave PIX não configurada")}
        </div>
      )}
      {config.beneficiary && (
        <div className="text-[11px] text-cat-green-fg truncate">
          {t("Favorecido")}: {config.beneficiary}
        </div>
      )}
      {config.card_image_url && (
        <div className="text-[11px] text-cat-green-fg truncate">
          📷 {t("Imagem do card configurada")}
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
