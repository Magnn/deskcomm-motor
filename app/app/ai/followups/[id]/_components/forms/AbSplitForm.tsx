"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { abSplitConfigSchema, type AbSplitBranch } from "@/lib/followup/graph-schema";
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
  const [branches, setBranches] = useState<AbSplitBranch[]>(() => {
    // Garante que cada branch tenha label T1, T2, etc se não tiver
    return config.branches.map((b, i) => ({
      ...b,
      label: b.label || `T${i + 1}`,
    }));
  });
  const [error, setError] = useState<string | null>(null);

  const total = branches.reduce(
    (soma, b) => soma + (Number.isFinite(b.percent) ? b.percent : 0),
    0
  );
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

  const handleSliderChange = (index: number, newValue: number) => {
    if (branches.length === 2) {
      // No caso de 2 branches, sincroniza automaticamente para somar 100%
      const outroIndex = index === 0 ? 1 : 0;
      const outroValor = Math.max(0, 100 - newValue);
      const next = branches.map((b, i) => {
        if (i === index) return { ...b, percent: newValue };
        if (i === outroIndex) return { ...b, percent: outroValor };
        return b;
      });
      setBranches(next);
      commit(next);
      return;
    }

    const next = branches.map((b, i) =>
      i === index ? { ...b, percent: newValue } : b
    );
    setBranches(next);
    commit(next);
  };

  const adicionarTeste = () => {
    if (branches.length >= 6) return;
    const usados = new Set(branches.map((b) => b.id));
    const novoNum = branches.length + 1;
    // Divide igualmente entre todos os branches
    const percentPorBranch = Math.floor(100 / novoNum);
    const sobra = 100 - percentPorBranch * novoNum;

    const nextBase = branches.map((b, i) => ({
      ...b,
      percent: percentPorBranch + (i === 0 ? sobra : 0),
    }));

    const novoBranch: AbSplitBranch = {
      id: novoId(usados),
      label: `T${novoNum}`,
      percent: percentPorBranch,
    };

    const next = [...nextBase, novoBranch];
    setBranches(next);
    commit(next);
  };

  const removerTeste = (index: number) => {
    if (branches.length <= 2) return;
    const filtrados = branches.filter((_, i) => i !== index);
    // Reindexa labels e redistribui percentual se desejado
    const percentPorBranch = Math.floor(100 / filtrados.length);
    const sobra = 100 - percentPorBranch * filtrados.length;

    const next = filtrados.map((b, i) => ({
      ...b,
      label: `T${i + 1}`,
      percent: percentPorBranch + (i === 0 ? sobra : 0),
    }));

    setBranches(next);
    commit(next);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Texto de Ajuda AcassIA */}
      <div className="space-y-2 text-[11.5px] text-slate-500 dark:text-zinc-400 leading-relaxed text-justify">
        <p>
          {t(
            "É possível segmentar sua audiência para experimentar diversas variações de uma campanha e identificar qual delas apresenta o desempenho mais eficaz."
          )}
        </p>
        <p>
          {t(
            "Isso envolve apresentar a versão A do conteúdo para uma parcela do seu público e a versão B para outra parcela."
          )}
        </p>
      </div>

      {/* Divisor com Botão Central + Adicionar Teste */}
      <div className="relative flex items-center justify-center my-4">
        <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
        <button
          type="button"
          disabled={branches.length >= 6}
          onClick={adicionarTeste}
          className="absolute bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-full px-4 py-1 text-[11.5px] font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={13} className="text-slate-400" />
          <span>{t("Adicionar Teste")}</span>
        </button>
      </div>

      {/* Cards de Teste T1, T2... */}
      <div className="space-y-3 pt-1">
        {branches.map((branch, index) => (
          <div
            key={branch.id}
            className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs overflow-hidden"
          >
            {/* Linha superior: T1 + slider */}
            <div className="p-3 flex items-center gap-3">
              <span className="text-[13px] font-bold text-slate-800 dark:text-zinc-100 min-w-[20px]">
                T{index + 1}
              </span>
              <div className="flex-1 flex items-center">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={branch.percent}
                  onChange={(e) =>
                    handleSliderChange(index, Number(e.target.value))
                  }
                  className="w-full h-1.5 bg-purple-100 dark:bg-purple-950/60 rounded-lg appearance-none cursor-pointer accent-[#a855f7]"
                />
              </div>
            </div>

            {/* Linha divisória fina */}
            <div className="border-t border-slate-100 dark:border-zinc-800/80" />

            {/* Linha inferior: XX% de execução + lixeira */}
            <div className="px-3 py-2 flex items-center justify-between bg-white dark:bg-zinc-900">
              <span className="text-[11.5px] font-medium text-blue-500 dark:text-blue-400">
                {branch.percent}% {t("de execução")}
              </span>
              <button
                type="button"
                aria-label={`Remover teste ${index + 1}`}
                disabled={branches.length <= 2}
                onClick={() => removerTeste(index)}
                className="text-red-500 hover:text-red-600 dark:text-red-400 transition-colors p-1 disabled:opacity-30 cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Banner de Validação se a soma for diferente de 100% */}
      {!isBalanced && (
        <div className="flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
          <span>{t("Total Distribuído:")}</span>
          <span>
            {total}% {t("⚠ Deve somar 100%")}
          </span>
        </div>
      )}

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
