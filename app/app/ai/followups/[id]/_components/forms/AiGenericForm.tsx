"use client";

import { useState } from "react";

import { Eye } from "@/lib/ui/icons";
import { aiGenericConfigSchema, type ReplySaveTo } from "@/lib/followup/graph-schema";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { usePipelines } from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

const VARIAVEIS_GPT = [
  "{{primeiro_nome}}",
  "{{telefone}}",
  "{{email}}",
  "{{resposta_anterior}}",
  "{{historico_conversa}}",
  "{{etapa_funil}}",
];

export function AiGenericForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ai_generic">;
  onChange: (c: ConfigOf<"ai_generic">) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState(config.prompt);
  const [saveTo, setSaveTo] = useState<ReplySaveTo>(config.save_to);
  const [maxTokens, setMaxTokens] = useState<number>(256);
  const [temperature, setTemperature] = useState<number>(0.7);
  const [showVars, setShowVars] = useState(false);
  const [sendAsText, setSendAsText] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pipelines = usePipelines();
  const campos = (pipelines.data?.data ?? []).flatMap((p) => camposDoFunil(p.settings));
  const camposUnicos = [...new Map(campos.map((c) => [c.key, c])).values()];

  const commit = (next: { prompt: string; saveTo: ReplySaveTo }) => {
    const parsed = aiGenericConfigSchema.safeParse({ prompt: next.prompt, save_to: next.saveTo });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleInsertVar = (v: string) => {
    const next = prompt ? `${prompt} ${v}` : v;
    setPrompt(next);
    commit({ prompt: next, saveTo });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="space-y-1 text-slate-500 dark:text-zinc-400 text-[11px] leading-relaxed">
        <p>
          {t(
            "Execute inteligência artificial generativa nesta etapa do fluxo. O prompt processará a conversa do contato e armazenará a resposta."
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Prompt de Comando")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label htmlFor="ai-generic-prompt" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Instrução do Sistema")}
          </label>
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="text-[11px] font-bold text-blue-500 dark:text-blue-400 flex items-center gap-1 hover:text-blue-600 transition-colors cursor-pointer"
          >
            <Eye size={13} />
            <span>{showVars ? t("✕ Fechar") : t("Campos Personalizados")}</span>
          </button>
        </div>

        <textarea
          id="ai-generic-prompt"
          rows={5}
          maxLength={2000}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            commit({ prompt: e.target.value, saveTo });
          }}
          placeholder={t("Analise a conversa do lead e identifique se há objeção de preço...")}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[13px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
        />

        {showVars && (
          <div className="p-3 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-2 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
              {t("Campos disponíveis")}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {VARIAVEIS_GPT.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleInsertVar(v)}
                  className="px-2 py-1.5 bg-white dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-zinc-200 text-[11px] font-mono font-medium rounded-lg border border-slate-200 dark:border-zinc-700 transition-colors text-left truncate shadow-2xs"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Modelo de IA")}
        </label>
        <select
          defaultValue="gemini-2.5-flash"
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
        >
          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Padrão de alta velocidade)</option>
          <option value="gemini-2.5-pro">Gemini 2.5 Pro (Raciocínio complexo)</option>
        </select>
      </div>

      {/* Sliders Max Tokens & Temperature */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50/50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 rounded-xl">
        <div className="space-y-2">
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-zinc-300">Max Tokens</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{maxTokens}</span>
          </div>
          <input
            type="range"
            min={50}
            max={2000}
            step={10}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            className="w-full accent-[#7c3aed] h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center text-[11px]">
            <span className="font-semibold text-slate-700 dark:text-zinc-300">Temperature</span>
            <span className="font-bold text-indigo-600 dark:text-indigo-400">{temperature}</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-[#7c3aed] h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      </div>

      <div className="flex items-center justify-between py-1">
        <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
          {t("Enviar resultado como texto no chat?")}
        </span>
        <button
          type="button"
          onClick={() => setSendAsText(!sendAsText)}
          className={`relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
            sendAsText ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
              sendAsText ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="space-y-1.5 pt-1">
        <label htmlFor="ai-generic-save" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Gravar retorno em campo de fluxo")}
        </label>
        <select
          id="ai-generic-save"
          value={
            saveTo.kind === "contact_name"
              ? "__contact_name__"
              : camposUnicos.some((c) => c.key === saveTo.key)
                ? saveTo.key
                : "__livre__"
          }
          onChange={(e) => {
            const v = e.target.value;
            const next: ReplySaveTo =
              v === "__contact_name__"
                ? { kind: "contact_name" }
                : v === "__livre__"
                  ? { kind: "lead_custom", key: "resultado_ia" }
                  : { kind: "lead_custom", key: v };
            setSaveTo(next);
            commit({ prompt, saveTo: next });
          }}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
        >
          <option value="__contact_name__">{t("Nome do contato")}</option>
          {camposUnicos.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label} ({c.key})
            </option>
          ))}
          <option value="__livre__">{t("Chave livre / Variável customizada")}</option>
        </select>

        {saveTo.kind === "lead_custom" && !camposUnicos.some((c) => c.key === saveTo.key) && (
          <input
            aria-label={t("Chave do campo personalizado")}
            value={saveTo.key}
            onChange={(e) => {
              const next: ReplySaveTo = { kind: "lead_custom", key: e.target.value };
              setSaveTo(next);
              commit({ prompt, saveTo: next });
            }}
            placeholder="GPT_NomeLead"
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs mt-1.5"
          />
        )}
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
