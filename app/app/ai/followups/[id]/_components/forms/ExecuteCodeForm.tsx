"use client";

import { useState } from "react";
import { Code, Plus, Trash, Info } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import {
  executeCodeConfigSchema,
  type ExecuteCodeConfig,
  type ExecuteCodeMapping,
} from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"execute_code">;
  onChange: (c: ConfigOf<"execute_code">) => void;
}

export function ExecuteCodeForm({ config, onChange }: Props) {
  const t = useT();
  const [code, setCode] = useState(
    config.code || '// Escreva seu código JavaScript aqui\n// Disponíveis: contact, message, customFields\nreturn {\n  status: "ok"\n};'
  );
  const [timeoutMs, setTimeoutMs] = useState(config.timeout_ms || 3000);
  const [outputField, setOutputField] = useState(config.output_field || "");
  const [mappings, setMappings] = useState<ExecuteCodeMapping[]>(config.mappings || []);

  const update = (patch: Partial<ExecuteCodeConfig>) => {
    const next: ExecuteCodeConfig = {
      code: patch.code ?? code,
      timeout_ms: patch.timeout_ms ?? timeoutMs,
      output_field: patch.output_field ?? outputField,
      mappings: patch.mappings ?? mappings,
    };
    const parsed = executeCodeConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const handleAddMapping = () => {
    const next = [...mappings, { json_path: "status", target_field: "" }];
    setMappings(next);
    update({ mappings: next });
  };

  const handleRemoveMapping = (index: number) => {
    const next = mappings.filter((_, i) => i !== index);
    setMappings(next);
    update({ mappings: next });
  };

  const handleUpdateMapping = (index: number, patch: Partial<ExecuteCodeMapping>) => {
    const next = mappings.map((m, i) => (i === index ? { ...m, ...patch } : m));
    setMappings(next);
    update({ mappings: next });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card */}
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d97706] text-white shadow-2xs">
          <Code size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Executar JavaScript")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Lógica personalizada, transformações e cálculos")}
          </p>
        </div>
      </div>

      {/* Editor de Código */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Código JS")} *
          </label>
          <span className="text-[10px] font-mono text-neutral-400">ES2022</span>
        </div>
        <div className="relative">
          <textarea
            value={code}
            rows={8}
            spellCheck={false}
            onChange={(e) => {
              setCode(e.target.value);
              update({ code: e.target.value });
            }}
            placeholder="// return { resultado: 123 };"
            className="w-full font-mono text-[11px] leading-relaxed rounded-lg border border-neutral-300 bg-neutral-900 text-neutral-100 p-3 shadow-inner outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Timeout */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Limite de Execução (Timeout)")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={500}
            max={10000}
            step={500}
            value={timeoutMs}
            onChange={(e) => {
              const val = Number(e.target.value);
              setTimeoutMs(val);
              update({ timeout_ms: val });
            }}
            className="w-32 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <span className="text-[11px] text-neutral-500">{t("ms (máx. 10.000 ms)")}</span>
        </div>
      </div>

      {/* Mapeamento de Retorno */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Mapeamento do Retorno JSON")}
          </label>
          <button
            type="button"
            onClick={handleAddMapping}
            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/50 cursor-pointer"
          >
            <Plus size={12} weight="bold" />
            <span>{t("Mapear Campo")}</span>
          </button>
        </div>

        {mappings.length === 0 ? (
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="block text-[10px] text-neutral-500">
                {t("Ou salvar todo o objeto retornado em um campo")}
              </label>
              <input
                type="text"
                placeholder={t("Nome ou chave do campo (opcional)")}
                value={outputField}
                onChange={(e) => {
                  setOutputField(e.target.value);
                  update({ output_field: e.target.value });
                }}
                className="w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((m, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder={t("Caminho JSON (ex: dados.total)")}
                  value={m.json_path}
                  onChange={(e) => handleUpdateMapping(idx, { json_path: e.target.value })}
                  className="w-1/2 font-mono rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <input
                  type="text"
                  placeholder={t("Campo de destino")}
                  value={m.target_field}
                  onChange={(e) => handleUpdateMapping(idx, { target_field: e.target.value })}
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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

      {/* Info Card */}
      <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/30 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2">
        <Info size={14} className="shrink-0 mt-0.5" />
        <span>
          {t("O código executa em ambiente sandbox isolado. Sempre utilize")} <code className="font-mono">return</code>{" "}
          {t("para retornar um objeto com os valores computados.")}
        </span>
      </div>
    </div>
  );
}
