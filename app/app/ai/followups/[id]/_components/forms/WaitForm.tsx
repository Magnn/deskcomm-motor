"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { waitConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import type { ConfigOf } from "./shared";

type UnitType = "segundos" | "minutos" | "horas" | "dias";

const UNIT_MULTIPLIERS: Record<UnitType, number> = {
  segundos: 1_000,
  minutos: 60_000,
  horas: 3_600_000,
  dias: 86_400_000,
};

const UNIT_LABELS: Record<UnitType, { singular: string; plural: string }> = {
  segundos: { singular: "Segundo", plural: "Segundos" },
  minutos: { singular: "Minuto", plural: "Minutos" },
  horas: { singular: "Hora", plural: "Horas" },
  dias: { singular: "Dia", plural: "Dias" },
};

function deduceUnitAndValue(ms: number): { value: number; unit: UnitType } {
  if (ms >= 86_400_000 && ms % 86_400_000 === 0) {
    return { value: Math.max(1, ms / 86_400_000), unit: "dias" };
  }
  if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
    return { value: Math.max(1, ms / 3_600_000), unit: "horas" };
  }
  if (ms >= 60_000) {
    return { value: Math.max(1, Math.round(ms / 60_000)), unit: "minutos" };
  }
  return { value: Math.max(1, Math.round(ms / 1_000)), unit: "segundos" };
}

export function WaitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"wait">;
  onChange: (c: ConfigOf<"wait">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"fixed" | "smart">(config.mode);

  const initialFixed = deduceUnitAndValue(config.mode === "fixed" ? config.duration_ms : 3_600_000);
  const initialMin = deduceUnitAndValue(config.mode === "smart" ? config.min_ms : 3_600_000);
  const initialMax = deduceUnitAndValue(config.mode === "smart" ? config.max_ms : 3_600_000);

  const [unit, setUnit] = useState<UnitType>(config.mode === "fixed" ? initialFixed.unit : initialMin.unit);
  const [fixedVal, setFixedVal] = useState<number>(initialFixed.value);
  const [minVal, setMinVal] = useState<number>(initialMin.value);
  const [maxVal, setMaxVal] = useState<number>(initialMax.value);

  const [typing, setTyping] = useState<boolean>(false);
  const [recording, setRecording] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (
    nextMode: "fixed" | "smart",
    nextUnit: UnitType,
    nextFixedVal: number,
    nextMinVal: number,
    nextMaxVal: number,
  ) => {
    const mult = UNIT_MULTIPLIERS[nextUnit];
    // Piso de segurança: o schema do motor exige no mínimo 300_000 ms (5 min)
    const toSafeMs = (v: number) => Math.max(300_000, Math.round(v * mult));

    const candidate =
      nextMode === "fixed"
        ? {
            mode: "fixed" as const,
            duration_ms: toSafeMs(nextFixedVal),
          }
        : {
            mode: "smart" as const,
            min_ms: toSafeMs(nextMinVal),
            max_ms: Math.max(toSafeMs(nextMinVal), toSafeMs(nextMaxVal)),
          };

    const parsed = waitConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleModeChange = (newMode: "fixed" | "smart") => {
    setMode(newMode);
    commit(newMode, unit, fixedVal, minVal, maxVal);
  };

  const handleUnitChange = (newUnit: UnitType) => {
    setUnit(newUnit);
    commit(mode, newUnit, fixedVal, minVal, maxVal);
  };

  const stepFixed = (delta: number) => {
    const next = Math.max(1, fixedVal + delta);
    setFixedVal(next);
    commit(mode, unit, next, minVal, maxVal);
  };

  const stepMin = (delta: number) => {
    const next = Math.max(1, minVal + delta);
    setMinVal(next);
    commit(mode, unit, fixedVal, next, maxVal);
  };

  const stepMax = (delta: number) => {
    const next = Math.max(1, maxVal + delta);
    setMaxVal(next);
    commit(mode, unit, fixedVal, minVal, next);
  };

  const unitPlural = UNIT_LABELS[unit].plural;

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Descrição textual idêntica ao AcassIA */}
      <p className="text-[11.5px] text-text-muted leading-relaxed">
        {t(
          "O bloco de delay irá fazer com que o fluxo fique em espera pela quantidade de segundos definido acima antes de continuar para o próximo bloco."
        )}
      </p>

      {/* Divisor Configurar */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-surface-elevated" />
        <span className="text-[11px] font-semibold text-text-subtle capitalize">
          {t("Configurar")}
        </span>
        <div className="h-px flex-1 bg-surface-elevated" />
      </div>

      {/* Toggle Pill: Fixo vs Inteligente em Roxo AcassIA */}
      <div className="flex justify-center">
        <div className="flex w-full bg-surface-elevated p-1 rounded-full border border-border shadow-xs">
          <button
            type="button"
            onClick={() => handleModeChange("fixed")}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer",
              mode === "fixed"
                ? "bg-[#7c3aed] text-white shadow-xs"
                : "text-text-muted hover:text-text"
            )}
          >
            {t("Fixo")}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("smart")}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-full transition-all cursor-pointer",
              mode === "smart"
                ? "bg-[#7c3aed] text-white shadow-xs"
                : "text-text-muted hover:text-text"
            )}
          >
            {t("Inteligente")}
          </button>
        </div>
      </div>

      {/* Título dinâmico reativo */}
      <div className="space-y-2 pt-1">
        <label className="block text-[12.5px] font-semibold text-text">
          {mode === "fixed"
            ? `${t("Delay de")} ${fixedVal} ${unitPlural}`
            : `${t("Delay inteligente de")} ${minVal} ${t("a")} ${maxVal} ${unitPlural}`}
        </label>

        {mode === "fixed" ? (
          <div className="flex items-center gap-3">
            {/* Input com stepper roxo integrado */}
            <div className="flex h-9 rounded-md border border-border bg-surface overflow-hidden shadow-xs">
              <input
                id="wait-duration"
                type="number"
                min="1"
                value={fixedVal}
                onChange={(e) => {
                  const v = Math.max(1, parseInt(e.target.value) || 1);
                  setFixedVal(v);
                  commit(mode, unit, v, minVal, maxVal);
                }}
                className="w-16 px-2 text-center text-sm font-semibold text-text outline-hidden bg-transparent"
              />
              <div className="flex flex-col bg-[#8b5cf6] text-white w-7 shrink-0">
                <button
                  type="button"
                  onClick={() => stepFixed(1)}
                  className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 transition-colors cursor-pointer"
                  title="Aumentar"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => stepFixed(-1)}
                  className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 border-t border-white/20 transition-colors cursor-pointer"
                  title="Diminuir"
                >
                  —
                </button>
              </div>
            </div>

            {/* Select de unidade (Hora, Minuto, Segundo, Dia) */}
            <div className="relative flex-1">
              <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value as UnitType)}
                className="w-full appearance-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted shadow-xs outline-hidden pr-8 cursor-pointer"
              >
                <option value="horas">Hora</option>
                <option value="minutos">Minuto</option>
                <option value="segundos">Segundo</option>
                <option value="dias">Dia</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none" />
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            {/* Box Mínimo */}
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex h-9 rounded-md border border-border bg-surface overflow-hidden shadow-xs">
                <input
                  id="wait-min"
                  type="number"
                  min="1"
                  value={minVal}
                  onChange={(e) => {
                    const v = Math.max(1, parseInt(e.target.value) || 1);
                    setMinVal(v);
                    commit(mode, unit, fixedVal, v, maxVal);
                  }}
                  className="w-full px-2 text-center text-sm font-semibold text-text outline-hidden bg-transparent"
                />
                <div className="flex flex-col bg-[#8b5cf6] text-white w-6 shrink-0">
                  <button
                    type="button"
                    onClick={() => stepMin(1)}
                    className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => stepMin(-1)}
                    className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 border-t border-white/20 transition-colors cursor-pointer"
                  >
                    —
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-text-subtle text-center">
                {t("Mínimo")}
              </span>
            </div>

            {/* Box Máximo */}
            <div className="flex flex-col gap-1 flex-1">
              <div className="flex h-9 rounded-md border border-border bg-surface overflow-hidden shadow-xs">
                <input
                  id="wait-max"
                  type="number"
                  min="1"
                  value={maxVal}
                  onChange={(e) => {
                    const v = Math.max(1, parseInt(e.target.value) || 1);
                    setMaxVal(v);
                    commit(mode, unit, fixedVal, minVal, v);
                  }}
                  className="w-full px-2 text-center text-sm font-semibold text-text outline-hidden bg-transparent"
                />
                <div className="flex flex-col bg-[#8b5cf6] text-white w-6 shrink-0">
                  <button
                    type="button"
                    onClick={() => stepMax(1)}
                    className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 transition-colors cursor-pointer"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => stepMax(-1)}
                    className="flex-1 hover:bg-[#7c3aed] flex items-center justify-center text-xs font-bold leading-none py-1 border-t border-white/20 transition-colors cursor-pointer"
                  >
                    —
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-text-subtle text-center">
                {t("Máximo")}
              </span>
            </div>

            {/* Select de unidade */}
            <div className="relative flex-1">
              <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value as UnitType)}
                className="w-full appearance-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-muted shadow-xs outline-hidden pr-8 cursor-pointer"
              >
                <option value="horas">Hora</option>
                <option value="minutos">Minuto</option>
                <option value="segundos">Segundo</option>
                <option value="dias">Dia</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Toggles de status digitando/gravando */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-semibold text-text">
            {t("Envia status (Digitando...)")}
          </label>
          <button
            type="button"
            onClick={() => setTyping(!typing)}
            className={cn(
              "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-hidden",
              typing ? "bg-[#8b5cf6]" : "bg-surface-elevated"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                typing ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-semibold text-text">
            {t("Envia status (Gravando...)")}
          </label>
          <button
            type="button"
            onClick={() => setRecording(!recording)}
            className={cn(
              "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-hidden",
              recording ? "bg-[#8b5cf6]" : "bg-surface-elevated"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                recording ? "translate-x-5" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
