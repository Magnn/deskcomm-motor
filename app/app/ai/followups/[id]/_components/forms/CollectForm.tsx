"use client";

import { useState, useRef } from "react";

import { Eye } from "@/lib/ui/icons";
import { collectConfigSchema, type ContactFlowFieldType } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

const FIELD_TYPES: Array<{ value: ContactFlowFieldType; label: string }> = [
  { value: "text", label: "Texto livre" },
  { value: "number", label: "Número" },
  { value: "cpf", label: "CPF (com validação)" },
  { value: "date", label: "Data" },
  { value: "boolean", label: "Sim / Não (Booleano)" },
  { value: "select", label: "Múltipla escolha (Opções)" },
];

const VARIAVEIS_PADRAO = [
  "{{primeiro_nome}}",
  "{{nome_completo}}",
  "{{telefone}}",
  "{{email}}",
  "{{saudacao}}",
  "{{resposta_anterior}}",
];

export function CollectForm({
  config,
  onChange,
}: {
  config: ConfigOf<"collect">;
  onChange: (c: ConfigOf<"collect">) => void;
}) {
  const t = useT();
  const [question, setQuestion] = useState(config.question ?? config.label ?? "");
  const [key, setKey] = useState(config.key ?? "resposta");
  const [label, setLabel] = useState(config.label ?? "Resposta");
  const [fieldType, setFieldType] = useState<ContactFlowFieldType>(config.type ?? "text");
  const [required, setRequired] = useState(config.required ?? true);
  const [permiteCorrecao, setPermiteCorrecao] = useState(config.permite_correcao ?? true);
  const [optionsStr, setOptionsStr] = useState((config.options ?? []).join(", "));
  const [showVars, setShowVars] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commit = (patch: Partial<ConfigOf<"collect">>) => {
    const updatedOptions =
      (patch.type ?? fieldType) === "select"
        ? (patch.options !== undefined ? patch.options : optionsStr.split(",").map((s) => s.trim()).filter(Boolean))
        : undefined;

    const candidate = {
      question: patch.question !== undefined ? patch.question : question,
      key: patch.key !== undefined ? patch.key : key,
      label: patch.label !== undefined ? patch.label : label,
      type: patch.type !== undefined ? patch.type : fieldType,
      required: patch.required !== undefined ? patch.required : required,
      permite_correcao: patch.permite_correcao !== undefined ? patch.permite_correcao : permiteCorrecao,
      options: updatedOptions,
    };

    const parsed = collectConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const insertVariable = (variableText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextQuestion = question.substring(0, start) + variableText + question.substring(end);
    setQuestion(nextQuestion);
    commit({ question: nextQuestion });
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableText.length, start + variableText.length);
    }, 0);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="space-y-1.5 text-slate-500 dark:text-zinc-400 text-[11px] leading-relaxed">
        <p>
          {t(
            "Esse bloco possibilita uma conversa humanizada com perguntas e respostas. A pergunta será enviada e o fluxo aguardará a resposta para gravar na variável escolhida."
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Configurar")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      {/* 1. Faça uma pergunta */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label htmlFor="collect-question" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Faça uma pergunta:")}
          </label>
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="text-[11px] font-bold text-blue-500 dark:text-blue-400 flex items-center gap-1.5 hover:text-blue-600 transition-colors cursor-pointer"
          >
            <Eye size={13} />
            <span>{showVars ? t("✕ Fechar") : t("Campos Personalizados")}</span>
          </button>
        </div>

        <textarea
          ref={textareaRef}
          id="collect-question"
          rows={4}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            commit({ question: e.target.value });
          }}
          placeholder={t("Ex: Qual é o seu nome completo?")}
          maxLength={400}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[13px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-y"
        />

        {showVars && (
          <div className="p-3 bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 rounded-xl space-y-2 animate-in fade-in duration-200">
            <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider block">
              {t("Inserir variável no cursor")}
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {VARIAVEIS_PADRAO.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-1.5 bg-white dark:bg-zinc-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-zinc-200 text-[11px] font-mono font-medium rounded-lg border border-slate-200 dark:border-zinc-700 transition-colors text-left truncate shadow-2xs"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Armazenamento")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="collect-key" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Nome do campo (chave)")}
          </label>
          <input
            id="collect-key"
            value={key}
            onChange={(e) => {
              const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
              setKey(val);
              commit({ key: val });
            }}
            placeholder="ex: cidade_lead"
            maxLength={60}
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="collect-label" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Rótulo de exibição")}
          </label>
          <input
            id="collect-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              commit({ label: e.target.value });
            }}
            placeholder="ex: Cidade do Lead"
            maxLength={80}
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="collect-type" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Tipo do dado coletado")}
        </label>
        <select
          id="collect-type"
          value={fieldType}
          onChange={(e) => {
            const v = e.target.value as ContactFlowFieldType;
            setFieldType(v);
            commit({ type: v });
          }}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
        >
          {FIELD_TYPES.map((ft) => (
            <option key={ft.value} value={ft.value}>
              {t(ft.label)}
            </option>
          ))}
        </select>
      </div>

      {fieldType === "select" && (
        <div className="space-y-1.5 animate-in fade-in duration-150">
          <label htmlFor="collect-options" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Opções permitidas")}
          </label>
          <input
            id="collect-options"
            value={optionsStr}
            onChange={(e) => {
              setOptionsStr(e.target.value);
              const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              commit({ options: list });
            }}
            placeholder="Sim, Não, Talvez"
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
          />
          <p className="text-[10px] text-slate-400">{t("Separe as opções por vírgula.")}</p>
        </div>
      )}

      {/* Toggles */}
      <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-zinc-800">
        <div className="flex items-center justify-between py-1">
          <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
            {t("Campo obrigatório?")}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = !required;
              setRequired(next);
              commit({ required: next });
            }}
            className={`relative inline-flex h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              required ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                required ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-300">
            {t("Permite correção posterior?")}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = !permiteCorrecao;
              setPermiteCorrecao(next);
              commit({ permite_correcao: next });
            }}
            className={`relative inline-flex h-[22px] w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              permiteCorrecao ? "bg-[#9333ea]" : "bg-slate-200 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                permiteCorrecao ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
