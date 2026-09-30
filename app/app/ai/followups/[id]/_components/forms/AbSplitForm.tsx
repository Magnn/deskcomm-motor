"use client";

import { useState } from "react";

import { abSplitConfigSchema, type AbSplitBranch } from "@/lib/followup/graph-schema";
import { Plus, Trash } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

function novoId(usados: ReadonlySet<string>): string {
  for (let n = 0; ; n++) {
    const candidato = String.fromCharCode(97 + (n % 26)) + (n >= 26 ? Math.floor(n / 26) : "");
    if (!usados.has(candidato)) return candidato;
  }
}

export function AbSplitForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ab_split">;
  onChange: (c: ConfigOf<"ab_split">) => void;
}) {
  const t = useT();
  const [branches, setBranches] = useState(config.branches);
  const [error, setError] = useState<string | null>(null);

  const total = branches.reduce((soma, b) => soma + (Number.isFinite(b.percent) ? b.percent : 0), 0);
  const isBalanced = total === 100;

  const commit = (next: AbSplitBranch[]) => {
    const parsed = abSplitConfigSchema.safeParse({ branches: next });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const atualizar = (index: number, patch: Partial<AbSplitBranch>) => {
    const next = branches.map((b, i) => (i === index ? { ...b, ...patch } : b));
    setBranches(next);
    commit(next);
  };

  const handleSliderChange = (index: number, newValue: number) => {
    const next = branches.map((b, i) => (i === index ? { ...b, percent: newValue } : b));
    setBranches(next);
    commit(next);
  };

  const adicionarTeste = () => {
    if (branches.length >= 6) return;
    const usados = new Set(branches.map((b) => b.id));
    const restante = Math.max(0, 100 - total);
    const next = [...branches, { id: novoId(usados), label: `${t("Teste")} ${branches.length + 1}`, percent: restante || 10 }];
    setBranches(next);
    commit(next);
  };

  const removerTeste = (index: number) => {
    if (branches.length <= 2) return;
    const next = branches.filter((_, i) => i !== index);
    setBranches(next);
    commit(next);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed text-justify">
        {t(
          "É possível segmentar sua audiência para experimentar diversas variações de uma campanha e identificar qual delas apresenta o desempenho mais eficaz."
        )}
      </p>

      <div className="flex justify-center pt-0.5">
        <button
          type="button"
          disabled={branches.length >= 6}
          onClick={adicionarTeste}
          className="border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-full px-4 py-1.5 text-[11px] font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 flex items-center gap-1.5 shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={14} className="text-slate-400" />
          <span>{t("Adicionar Teste")}</span>
        </button>
      </div>

      <div className="space-y-3 pt-1">
        {branches.map((branch, index) => (
          <div
            key={branch.id}
            className="flex flex-col gap-2 p-3 border border-slate-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold text-slate-700 dark:text-zinc-300 w-6">
                T{index + 1}
              </span>
              <input
                aria-label={`Rótulo do caminho ${index + 1}`}
                value={branch.label}
                onChange={(e) => atualizar(index, { label: e.target.value })}
                placeholder={t("Rótulo")}
                className="flex-1 px-2.5 py-1 text-[12px] border border-slate-200 dark:border-zinc-700 rounded-md outline-none focus:border-indigo-500 text-slate-700 dark:text-zinc-100 bg-transparent"
              />
              <button
                type="button"
                aria-label={`Remover caminho ${index + 1}`}
                disabled={branches.length <= 2}
                onClick={() => removerTeste(index)}
                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition-colors disabled:opacity-30 cursor-pointer"
              >
                <Trash size={14} aria-hidden />
              </button>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <input
                aria-label={`Percentual do caminho ${index + 1}`}
                type="range"
                min={1}
                max={100}
                value={branch.percent}
                onChange={(e) => handleSliderChange(index, Number(e.target.value))}
                className="flex-1 accent-[#a855f7] h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
              />
              <span className="w-16 text-right font-bold text-[12px] text-blue-500 dark:text-blue-400">
                {branch.percent}%
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Banner de Validação 100% Calibrado */}
      <div
        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold ${
          isBalanced
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
        }`}
      >
        <span>{t("Total Distribuído:")}</span>
        <span>
          {total}% {isBalanced ? t("✓ 100% Calibrado") : t("⚠ Deve somar 100%")}
        </span>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
