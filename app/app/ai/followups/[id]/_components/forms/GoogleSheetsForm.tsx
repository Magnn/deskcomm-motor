"use client";

import { useState } from "react";
import { GoogleLogo, Plus, Trash, Info } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import {
  googleSheetsConfigSchema,
  type GoogleSheetsConfig,
  type GoogleSheetsOperation,
  GOOGLE_SHEETS_OPERATIONS,
} from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"google_sheets">;
  onChange: (c: ConfigOf<"google_sheets">) => void;
}

export function GoogleSheetsForm({ config, onChange }: Props) {
  const t = useT();
  const [operation, setOperation] = useState<GoogleSheetsOperation>(config.operation || "insert_row");
  const [spreadsheetId, setSpreadsheetId] = useState(config.spreadsheet_id || "");
  const [sheetName, setSheetName] = useState(config.sheet_name || "Página1");
  const [lookupColumn, setLookupColumn] = useState(config.lookup_column || "");
  const [lookupValue, setLookupValue] = useState(config.lookup_value || "");
  const [mappings, setMappings] = useState<Array<{ column: string; value: string; custom_field?: string }>>(
    config.mappings || []
  );

  const update = (patch: Partial<GoogleSheetsConfig>) => {
    const next: GoogleSheetsConfig = {
      operation: patch.operation ?? operation,
      spreadsheet_id: patch.spreadsheet_id ?? spreadsheetId,
      sheet_name: patch.sheet_name ?? sheetName,
      lookup_column: patch.lookup_column ?? lookupColumn,
      lookup_value: patch.lookup_value ?? lookupValue,
      mappings: patch.mappings ?? mappings,
    };
    const parsed = googleSheetsConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const handleAddMapping = () => {
    const next = [...mappings, { column: "", value: "{{nome}}" }];
    setMappings(next);
    update({ mappings: next });
  };

  const handleRemoveMapping = (index: number) => {
    const next = mappings.filter((_, i) => i !== index);
    setMappings(next);
    update({ mappings: next });
  };

  const handleUpdateMapping = (index: number, patch: Partial<{ column: string; value: string }>) => {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...patch } : m));
    setMappings(next);
    update({ mappings: next });
  };

  const opLabels: Record<GoogleSheetsOperation, { title: string; desc: string }> = {
    insert_row: {
      title: t("Inserir nova linha"),
      desc: t("Adiciona uma nova linha com os dados do contato"),
    },
    get_row: {
      title: t("Buscar linha por valor"),
      desc: t("Busca uma linha correspondente para ler dados"),
    },
    update_row: {
      title: t("Atualizar linha existente"),
      desc: t("Localiza e atualiza campos de uma linha específica"),
    },
    clear_row: {
      title: t("Limpar linha"),
      desc: t("Remove os valores da linha correspondente"),
    },
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#15803d] text-white shadow-2xs">
          <GoogleLogo size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Google Sheets")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Integração bidirecional com Planilhas Google")}
          </p>
        </div>
      </div>

      {/* Operação */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Ação na Planilha")} *
        </label>
        <select
          value={operation}
          onChange={(e) => {
            const val = e.target.value as GoogleSheetsOperation;
            setOperation(val);
            update({ operation: val });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {GOOGLE_SHEETS_OPERATIONS.map((op) => (
            <option key={op} value={op}>
              {opLabels[op].title}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
          {opLabels[operation]?.desc}
        </p>
      </div>

      {/* ID da Planilha */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("ID ou Link da Planilha")} *
        </label>
        <input
          type="text"
          value={spreadsheetId}
          placeholder="ex: 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
          onChange={(e) => {
            const val = e.target.value.trim();
            // Extrai ID se colou URL inteira do Google Sheets
            const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
            const resolved = match ? match[1]! : val;
            setSpreadsheetId(resolved);
            update({ spreadsheet_id: resolved });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>

      {/* Nome da Aba / Página */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Nome da Aba / Página")} *
        </label>
        <input
          type="text"
          value={sheetName}
          placeholder={t("ex: Página1 ou Leads")}
          onChange={(e) => {
            setSheetName(e.target.value);
            update({ sheet_name: e.target.value });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>

      {/* Campos de Busca (se não for insert_row) */}
      {operation !== "insert_row" && (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5 dark:border-neutral-800 dark:bg-neutral-900/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            {t("Critério de Busca")}
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                {t("Coluna")} (ex: A ou Email)
              </label>
              <input
                type="text"
                value={lookupColumn}
                placeholder="ex: Telefone"
                onChange={(e) => {
                  setLookupColumn(e.target.value);
                  update({ lookup_column: e.target.value });
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                {t("Valor de Busca")}
              </label>
              <input
                type="text"
                value={lookupValue}
                placeholder="{{phone}}"
                onChange={(e) => {
                  setLookupValue(e.target.value);
                  update({ lookup_value: e.target.value });
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Mapeamento de Colunas */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Mapeamento de Colunas e Dados")}
          </label>
          <button
            type="button"
            onClick={handleAddMapping}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50 cursor-pointer"
          >
            <Plus size={12} weight="bold" />
            <span>{t("Adicionar Coluna")}</span>
          </button>
        </div>

        {mappings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-300 p-3 text-center text-[11px] text-neutral-400 dark:border-neutral-700">
            {t("Nenhuma coluna mapeada. Clique em 'Adicionar Coluna' para enviar dados.")}
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((m, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={t("Coluna (ex: Nome)")}
                  value={m.column}
                  onChange={(e) => handleUpdateMapping(idx, { column: e.target.value })}
                  className="w-1/3 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <input
                  type="text"
                  placeholder={t("Valor (ex: {{nome}})")}
                  value={m.value}
                  onChange={(e) => handleUpdateMapping(idx, { value: e.target.value })}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveMapping(idx)}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
                >
                  <Trash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-[11px] text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-300 flex items-start gap-2">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          {t("Variáveis disponíveis")}: <code className="font-mono">{"{{nome}}"}</code>,{" "}
          <code className="font-mono">{"{{telefone}}"}</code>,{" "}
          <code className="font-mono">{"{{email}}"}</code>,{" "}
          <code className="font-mono">{"{{custom.campo}}"}</code>.
        </span>
      </div>
    </div>
  );
}
