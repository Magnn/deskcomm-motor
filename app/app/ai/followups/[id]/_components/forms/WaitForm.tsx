"use client";

import { useState } from "react";

import { waitConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import { msToMin, minToMs, type ConfigOf } from "./shared";

export function WaitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"wait">;
  onChange: (c: ConfigOf<"wait">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<"fixed" | "smart">(config.mode);
  const [durationMin, setDurationMin] = useState(
    config.mode === "fixed" ? msToMin(config.duration_ms) : 10,
  );
  const [minMin, setMinMin] = useState(config.mode === "smart" ? msToMin(config.min_ms) : 5);
  const [maxMin, setMaxMin] = useState(config.mode === "smart" ? msToMin(config.max_ms) : 60);
  const [guidance, setGuidance] = useState(config.mode === "smart" ? (config.guidance ?? "") : "");
  const [immuneToReply, setImmuneToReply] = useState(
    config.mode === "fixed" ? (config.immune_to_reply ?? false) : false,
  );
  const [statusTyping, setStatusTyping] = useState(false);
  const [statusRecording, setStatusRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: {
    mode: "fixed" | "smart";
    durationMin: number;
    minMin: number;
    maxMin: number;
    guidance: string;
    immuneToReply: boolean;
  }) => {
    const candidate =
      next.mode === "fixed"
        ? {
            mode: "fixed" as const,
            duration_ms: minToMs(next.durationMin),
            ...(next.immuneToReply ? { immune_to_reply: true } : {}),
          }
        : {
            mode: "smart" as const,
            min_ms: minToMs(next.minMin),
            max_ms: minToMs(next.maxMin),
            ...(next.guidance.trim() ? { guidance: next.guidance } : {}),
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
    commit({ mode: newMode, durationMin, minMin, maxMin, guidance, immuneToReply });
  };

  const handleStep = (delta: number) => {
    const next = Math.max(5, durationMin + delta);
    setDurationMin(next);
    commit({ mode, durationMin: next, minMin, maxMin, guidance, immuneToReply });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {t(
          "O bloco de delay fará com que o fluxo fique em espera pelo tempo definido antes de continuar para o próximo bloco."
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Configurar")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      {/* Pill Toggle Switch: Fixo vs Inteligente */}
      <div className="flex justify-center">
        <div className="flex bg-slate-100 dark:bg-zinc-800/80 rounded-full p-1 border border-slate-200 dark:border-zinc-700 shadow-inner">
          <button
            type="button"
            onClick={() => handleModeChange("fixed")}
            className={`px-4 py-1 text-[11px] font-bold rounded-full transition-all ${
              mode === "fixed"
                ? "bg-[#06b6d4] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400"
            }`}
          >
            {t("Fixo")}
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("smart")}
            className={`px-4 py-1 text-[11px] font-bold rounded-full transition-all ${
              mode === "smart"
                ? "bg-[#06b6d4] text-white shadow-xs"
                : "text-slate-500 hover:text-slate-700 dark:text-zinc-400"
            }`}
          >
            {t("Inteligente")}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-100">
          {mode === "fixed"
            ? `${t("Delay de")} ${durationMin} ${t("Minutos")}`
            : `${t("Delay entre")} ${minMin} ${t("a")} ${maxMin} ${t("Minutos")}`}
        </label>
        <span className="text-[10px] text-slate-400">
          {t("Limite operacional: 5 minutos a 90 dias por bloco.")}
        </span>

        {mode === "fixed" ? (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden flex-1 h-9">
              <input
                id="wait-duration"
                type="number"
                min="5"
                value={durationMin}
                onChange={(e) => {
                  const v = Math.max(5, parseInt(e.target.value) || 5);
                  setDurationMin(v);
                  commit({ mode, durationMin: v, minMin, maxMin, guidance, immuneToReply });
                }}
                className="w-full px-3 text-[13px] outline-none text-slate-700 dark:text-zinc-100 bg-transparent"
              />
              <div className="flex flex-col border-l border-slate-200 dark:border-zinc-800 w-8">
                <button
                  type="button"
                  onClick={() => handleStep(5)}
                  className="bg-[#a855f7] hover:bg-[#9333ea] text-white flex-1 flex items-center justify-center text-[12px] font-bold transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleStep(-5)}
                  className="bg-[#a855f7] hover:bg-[#9333ea] text-white flex-1 flex items-center justify-center text-[12px] font-bold transition-colors border-t border-white/20"
                >
                  -
                </button>
              </div>
            </div>
            <span className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 text-[12px] font-medium text-slate-600 dark:text-zinc-400">
              Min.
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1">
              <input
                id="wait-min"
                type="number"
                min="5"
                value={minMin}
                onChange={(e) => {
                  const v = Math.max(5, parseInt(e.target.value) || 5);
                  setMinMin(v);
                  commit({ mode, durationMin, minMin: v, maxMin, guidance, immuneToReply });
                }}
                placeholder={t("Mínimo")}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-100 outline-none"
              />
            </div>
            <span className="text-slate-400 font-bold text-xs">{t("a")}</span>
            <div className="flex-1">
              <input
                id="wait-max"
                type="number"
                min="5"
                value={maxMin}
                onChange={(e) => {
                  const v = Math.max(5, parseInt(e.target.value) || 5);
                  setMaxMin(v);
                  commit({ mode, durationMin, minMin, maxMin: v, guidance, immuneToReply });
                }}
                placeholder={t("Máximo")}
                className="w-full rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-100 outline-none"
              />
            </div>
            <span className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 px-2 py-2 text-[12px] font-medium text-slate-600 dark:text-zinc-400">
              Min.
            </span>
          </div>
        )}
      </div>

      {mode === "smart" && (
        <div className="space-y-1.5 pt-1">
          <label htmlFor="wait-guidance" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-100">
            {t("Orientação para a IA")}
          </label>
          <textarea
            id="wait-guidance"
            maxLength={500}
            rows={3}
            value={guidance}
            onChange={(e) => {
              setGuidance(e.target.value);
              commit({ mode, durationMin, minMin, maxMin, guidance: e.target.value, immuneToReply });
            }}
            placeholder={t("Ex: Espere menos se o lead mostrou pressa, ou mais em fins de semana.")}
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[12px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
          />
        </div>
      )}

      {/* Switches AcassIA */}
      <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800/80">
        {mode === "fixed" && (
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col pr-2">
              <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
                {t("Imunidade a resposta")}
              </span>
              <span className="text-[10px] text-slate-400">
                {t("Não cancela a espera se o contato enviar mensagem")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !immuneToReply;
                setImmuneToReply(next);
                commit({ mode, durationMin, minMin, maxMin, guidance, immuneToReply: next });
              }}
              className={`relative inline-flex h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                immuneToReply ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                  immuneToReply ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        )}

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col pr-2">
            <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
              {t("Envia status (Digitando...)")}
            </span>
            <span className="text-[10px] text-slate-400">
              {t("Simula presença de digitação no WhatsApp")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusTyping(!statusTyping)}
            className={`relative inline-flex h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              statusTyping ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                statusTyping ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div className="flex flex-col pr-2">
            <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
              {t("Envia status (Gravando...)")}
            </span>
            <span className="text-[10px] text-slate-400">
              {t("Simula presença de gravação de áudio")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setStatusRecording(!statusRecording)}
            className={`relative inline-flex h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              statusRecording ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                statusRecording ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
