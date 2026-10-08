"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import type { GoogleSheetsConfig } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { GoogleLogo } from "@/lib/ui/icons";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function GoogleSheetsNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as GoogleSheetsConfig;

  const opLabels: Record<string, string> = {
    insert_row: t("Inserir nova linha"),
    get_row: t("Buscar linha por valor"),
    update_row: t("Atualizar linha existente"),
    clear_row: t("Limpar linha"),
  };

  const customPreview = (
    <div className="space-y-2 rounded-lg border border-cat-green/30 bg-cat-green-bg p-2.5 text-xs text-cat-green-fg shadow-2xs">
      <div className="flex items-center justify-between font-semibold">
        <span className="flex items-center gap-1.5">
          <GoogleLogo size={14} className="text-cat-green" />
          <span>{opLabels[config.operation] || t("Planilha")}</span>
        </span>
        <span className="rounded-md bg-cat-green-bg px-1.5 py-0.5 text-[10px] font-bold text-cat-green-fg">
          {config.sheet_name || t("Página1")}
        </span>
      </div>

      {config.spreadsheet_id ? (
        <div className="font-mono text-[10px] truncate text-cat-green-fg" title={config.spreadsheet_id}>
          ID: {config.spreadsheet_id.slice(0, 24)}...
        </div>
      ) : (
        <div className="text-[11px] italic text-cat-green">
          {t("Planilha não selecionada")}
        </div>
      )}

      {config.operation !== "insert_row" && config.lookup_column && (
        <div className="text-[11px] text-cat-green-fg truncate">
          {t("Coluna de busca")}: <span className="font-semibold">{config.lookup_column}</span>
        </div>
      )}

      {config.mappings && config.mappings.length > 0 && (
        <div className="text-[10px] text-cat-green-fg">
          {config.mappings.length} {config.mappings.length === 1 ? t("coluna mapeada") : t("colunas mapeadas")}
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.google_sheets}
      label={data.label}
      subtitle={describeNodeConfig("google_sheets", data.config, t)}
      selected={selected}
      errors={data.errors}
      customPreview={customPreview}
    />
  );
}
