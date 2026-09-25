"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/**
 * A/B split de tráfego — referência de UX da pesquisa (AcassIA `ab_split`):
 * poucos campos, um por braço (rótulo + percentual), com o total sempre
 * visível. A "conversão por caminho ao vivo" da referência fica para uma
 * frente futura de métricas por nó — hoje o card mostra a divisão
 * CONFIGURADA (o que o operador decidiu), não o resultado medido.
 */
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

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>{t("Caminhos e percentual de cada um")}</Label>
        {branches.map((branch, index) => (
          <div key={branch.id} className="flex items-center gap-2">
            <Input
              aria-label={`Rótulo do caminho ${index + 1}`}
              value={branch.label}
              onChange={(e) => atualizar(index, { label: e.target.value })}
              placeholder={t("Rótulo")}
              className="flex-1"
            />
            <Input
              aria-label={`Percentual do caminho ${index + 1}`}
              type="number"
              min={1}
              max={100}
              value={branch.percent}
              onChange={(e) => atualizar(index, { percent: Number(e.target.value) })}
              className="w-20"
            />
            <span className="text-sm text-text-muted">%</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Remover caminho ${index + 1}`}
              disabled={branches.length <= 2}
              onClick={() => {
                const next = branches.filter((_, i) => i !== index);
                setBranches(next);
                commit(next);
              }}
            >
              <Trash size={14} aria-hidden />
            </Button>
          </div>
        ))}
        {branches.length < 6 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const usados = new Set(branches.map((b) => b.id));
              const restante = Math.max(0, 100 - total);
              const next = [...branches, { id: novoId(usados), label: t("Novo caminho"), percent: restante || 10 }];
              setBranches(next);
              commit(next);
            }}
          >
            <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar caminho")}
          </Button>
        )}
        <p className={`text-xs ${total === 100 ? "text-text-muted" : "text-error-fg"}`}>
          {t("Total")}: {total}% {total !== 100 && `(${t("precisa somar 100%")})`}
        </p>
      </div>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
