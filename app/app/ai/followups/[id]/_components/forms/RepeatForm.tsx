"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { repeatConfigSchema } from "@/lib/followup/graph-schema";
import { ArrowsClockwise, Check, ArrowBendUpLeft, Info } from "@/lib/ui/icons";
import type { ConfigOf } from "./shared";

const PRESETS = [3, 5, 10, 20];

export function RepeatForm({
  config,
  onChange,
}: {
  config: ConfigOf<"repeat">;
  onChange: (c: ConfigOf<"repeat">) => void;
}) {
  const t = useT();
  const [maxCount, setMaxCount] = useState(String(config.max_count));
  const [error, setError] = useState<string | null>(null);

  const commit = (raw: string) => {
    setMaxCount(raw);
    const num = Number(raw);
    const parsed = repeatConfigSchema.safeParse({ max_count: num });
    if (!parsed.success) {
      setError(t("Informe um número de 1 a 20 voltas."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const applyPreset = (num: number) => {
    commit(String(num));
  };

  const currentVal = Number(maxCount) || config.max_count;

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header banner sofisticado */}
      <div className="flex items-center gap-2.5 rounded-lg border border-teal-200 bg-teal-50/70 p-3 text-teal-950 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-2xs">
          <ArrowsClockwise size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Repetição / Loop")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Repete um trecho do fluxo por até X voltas controladas")}
          </p>
        </div>
      </div>

      {/* Seção de Limite Máximo de Voltas com Presets */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="repeat-max" className="text-[11px] font-semibold text-text-muted">
            {t("No máximo quantas voltas")}
          </Label>
          <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-400 bg-teal-100/60 dark:bg-teal-950/60 px-2 py-0.5 rounded-md">
            {currentVal} {currentVal === 1 ? t("volta") : t("voltas")}
          </span>
        </div>

        {/* Input Numérico + Slider sincronizado */}
        <div className="flex items-center gap-2">
          <input
            type="range"
            min="1"
            max="20"
            step="1"
            value={currentVal}
            onChange={(e) => commit(e.target.value)}
            className="grow h-1.5 bg-surface-elevated rounded-lg appearance-none cursor-pointer accent-teal-600"
          />
          <Input
            id="repeat-max"
            type="number"
            min={1}
            max={20}
            value={maxCount}
            onChange={(e) => commit(e.target.value)}
            className="w-16 h-8 text-xs font-mono text-center shrink-0"
          />
        </div>

        {/* Pílulas de presets rápidos */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-text-subtle">{t("Atalhos:")}</span>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                currentVal === p
                  ? "bg-teal-600 text-white shadow-2xs"
                  : "bg-surface-elevated text-text-muted hover:bg-surface-elevated"
              }`}
            >
              {p}x
            </button>
          ))}
        </div>
      </div>

      {/* Explicação das Saídas do Loop */}
      <div className="space-y-2 rounded-lg border border-border bg-surface-elevated p-3 text-text-muted">
        <span className="text-[11px] font-semibold text-text block">
          {t("Como este nó roteia:")}
        </span>
        <div className="space-y-1.5 text-[11px]">
          <div className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400">
            <ArrowBendUpLeft size={14} className="shrink-0" />
            <span><strong>{t("Próxima volta:")}</strong> {t("Executa enquanto contador <")} {currentVal}</span>
          </div>
          <div className="flex items-center gap-1.5 text-text-muted">
            <Check size={14} className="shrink-0 text-emerald-600" />
            <span><strong>{t("Acabou:")}</strong> {t("Disparado ao atingir o teto de voltas")}</span>
          </div>
        </div>
      </div>

      {/* Variáveis disponíveis no Loop */}
      <div className="flex items-start gap-1.5 p-2 rounded-lg bg-blue-50/50 border border-blue-200/60 dark:bg-blue-950/20 dark:border-blue-900/40 text-[11px] text-blue-900 dark:text-blue-300">
        <Info size={14} className="text-blue-500 shrink-0 mt-0.5" />
        <span>
          {t("Dica: você pode usar ")}
          <code className="bg-white/80 px-1 py-0.5 rounded-md font-mono text-[10px]">
            {t("{volta}")}
          </code>
          {t(" nos textos de nós seguintes para exibir o número da iteração.")}
        </span>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
