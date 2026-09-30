"use client";

import { useState } from "react";

import { menuConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Plus, Trash } from "@/lib/ui/icons";

import type { ConfigOf } from "./shared";
import { minToMs, msToMin } from "./shared";

type MenuOption = ConfigOf<"menu">["options"][number];

function novoId(usados: ReadonlySet<string>): string {
  for (let numero = 1; ; numero++) {
    const candidato = `opcao_${numero}`;
    if (!usados.has(candidato)) return candidato;
  }
}

export function MenuForm({
  config,
  onChange,
}: {
  config: ConfigOf<"menu">;
  onChange: (config: ConfigOf<"menu">) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState(config.prompt);
  const [options, setOptions] = useState(config.options);
  const [graceMin, setGraceMin] = useState(msToMin(config.grace_timeout_ms));
  const [error, setError] = useState<string | null>(null);

  const commit = (next: { prompt: string; options: MenuOption[]; graceMin: number }) => {
    const parsed = menuConfigSchema.safeParse({
      prompt: next.prompt,
      options: next.options,
      grace_timeout_ms: minToMs(next.graceMin),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const atualizarOpcao = (index: number, label: string) => {
    const next = options.map((option, current) =>
      current === index ? { ...option, label } : option,
    );
    setOptions(next);
    commit({ prompt, options: next, graceMin });
  };

  const adicionarOpcao = () => {
    if (options.length >= 8) return;
    const usados = new Set(options.map((option) => option.id));
    const next = [...options, { id: novoId(usados), label: `Opção ${options.length + 1}` }];
    setOptions(next);
    commit({ prompt, options: next, graceMin });
  };

  const removerOpcao = (index: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, current) => current !== index);
    setOptions(next);
    commit({ prompt, options: next, graceMin });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {t(
          "Crie um menu interativo de opções. O contato pode responder digitando o número ou o texto da opção para seguir pelo respectivo caminho."
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Configurar Título")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="menu-prompt" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Mensagem de texto")}
        </label>
        <textarea
          id="menu-prompt"
          rows={3}
          maxLength={1000}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            commit({ prompt: event.target.value, options, graceMin });
          }}
          placeholder={t("Selecione uma das opções abaixo:")}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[13px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Opções do Menu")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={options.length >= 8}
          onClick={adicionarOpcao}
          className="border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-full px-4 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={14} className="text-slate-400" />
          <span>{t("Adicionar Opção")}</span>
        </button>
      </div>

      {options.length > 0 && (
        <div className="flex flex-col gap-2.5 p-3 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-xs bg-slate-50/50 dark:bg-zinc-900/40">
          {options.map((option, index) => (
            <div
              key={option.id}
              className="flex flex-col gap-1.5 bg-white dark:bg-zinc-900 p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800 shadow-xs"
            >
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${t("Opção")} ${index + 1}`}
                  maxLength={40}
                  value={option.label}
                  onChange={(event) => atualizarOpcao(index, event.target.value)}
                  className="flex-1 px-2.5 py-1.5 text-[12px] border border-slate-200 dark:border-zinc-700 rounded-md outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-slate-700 dark:text-zinc-100 bg-transparent"
                />
                <button
                  type="button"
                  aria-label={`${t("Remover opção")} ${index + 1}`}
                  disabled={options.length <= 2}
                  onClick={() => removerOpcao(index)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors disabled:opacity-30 cursor-pointer"
                >
                  <Trash size={14} aria-hidden />
                </button>
              </div>
              <div className="text-[11px] font-semibold text-blue-500 dark:text-blue-400 pl-1">
                {t("Opção")} {index + 1}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1.5 pt-1">
        <label htmlFor="menu-grace" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Esperar resposta por (minutos)")}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="menu-grace"
            type="number"
            min={15}
            value={graceMin}
            onChange={(event) => {
              const next = Math.max(15, Number(event.target.value) || 15);
              setGraceMin(next);
              commit({ prompt, options, graceMin: next });
            }}
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-700 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          />
          <span className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 px-3 py-2 text-[12px] font-medium text-slate-600 dark:text-zinc-400">
            Min.
          </span>
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
