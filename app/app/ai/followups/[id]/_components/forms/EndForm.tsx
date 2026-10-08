"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { endConfigSchema } from "@/lib/followup/graph-schema";
import { RESULTADOS_DO_FIM, opcoes, type ResultadoDoFim } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import { Flag, CheckCircle, Warning, Sparkle, Eye } from "@/lib/ui/icons";

import type { ConfigOf } from "./shared";

const OUTCOME_CARDS: Array<{
  id: ResultadoDoFim;
  label: string;
  desc: string;
  icon: typeof CheckCircle;
  color: string;
  activeBorder: string;
  activeBg: string;
}> = [
  {
    id: "converted",
    label: "Convertido",
    desc: "O lead atingiu a meta ou concluiu o objetivo com sucesso.",
    icon: CheckCircle,
    color: "text-cat-green",
    activeBorder: "border-cat-green",
    activeBg: "bg-cat-green-bg",
  },
  {
    id: "exhausted",
    label: "Esgotado",
    desc: "O fluxo tentou todos os contatos sem sucesso ou sem resposta.",
    icon: Warning,
    color: "text-cat-amber",
    activeBorder: "border-cat-amber",
    activeBg: "bg-cat-amber-bg",
  },
  {
    id: "custom",
    label: "Personalizado",
    desc: "Encerramento com desfecho e nota específicos para o CRM.",
    icon: Sparkle,
    color: "text-cat-violet",
    activeBorder: "border-cat-violet",
    activeBg: "bg-cat-violet-bg",
  },
];

const VAR_TAGS = ["{nome_completo}", "{primeiro_nome}", "{telefone}", "{motivo}"];

export function EndForm({
  config,
  onChange,
}: {
  config: ConfigOf<"end">;
  onChange: (c: ConfigOf<"end">) => void;
}) {
  const t = useT();
  const [outcome, setOutcome] = useState(config.outcome);
  const [note, setNote] = useState(config.note ?? "");
  const [showVars, setShowVars] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: { outcome: ResultadoDoFim; note: string }) => {
    const candidate = { outcome: next.outcome, ...(next.note.trim() ? { note: next.note } : {}) };
    const parsed = endConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleSelectOutcome = (val: ResultadoDoFim) => {
    setOutcome(val);
    commit({ outcome: val, note });
  };

  const insertVariable = (varName: string) => {
    const nextNote = note ? `${note} ${varName}` : varName;
    setNote(nextNote);
    commit({ outcome, note: nextNote });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Banner de cabeçalho sofisticado */}
      <div className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-elevated p-3 text-text">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-700 text-white shadow-2xs">
          <Flag size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Fim do Fluxo")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Encerra a inscrição e define o status final do lead")}
          </p>
        </div>
      </div>

      {/* Cards visuais de resultado */}
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-text-muted block">
          {t("Selecione o desfecho:")}
        </label>
        <div className="grid grid-cols-1 gap-2">
          {OUTCOME_CARDS.map((card) => {
            const isSelected = outcome === card.id;
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                onClick={() => handleSelectOutcome(card.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                  isSelected
                    ? `${card.activeBorder} ${card.activeBg} shadow-xs`
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${card.color}`}>
                  <Icon size={16} weight="bold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text">
                      {t(card.label)}
                    </span>
                    {isSelected && (
                      <span className="text-[10px] font-medium text-cat-green bg-cat-green-bg px-1.5 py-0.5 rounded-md">
                        {t("Ativo")}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 leading-snug">
                    {t(card.desc)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Select padrão sincronizado para compatibilidade 100% com testes e acessibilidade */}
      <div className="space-y-1.5 pt-1">
        <Label htmlFor="end-outcome" className="text-[11px] font-semibold text-text-muted">
          {t("Resultado")}
        </Label>
        <Select
          value={outcome}
          onValueChange={(v) => handleSelectOutcome(v as ResultadoDoFim)}
        >
          <SelectTrigger id="end-outcome" className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {opcoes(RESULTADOS_DO_FIM).map(({ valor, rotulo }) => (
              <SelectItem key={valor} value={valor}>
                {t(rotulo)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nota com suporte a variáveis */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="end-note" className="text-[11px] font-semibold text-text-muted">
            {t("Nota de encerramento (opcional)")}
          </Label>
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="inline-flex items-center gap-1 text-[11px] text-cat-blue hover:underline cursor-pointer"
          >
            <Eye size={12} />
            <span>{t("Variáveis")}</span>
          </button>
        </div>

        {showVars && (
          <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-cat-blue-bg border border-cat-blue/30">
            {VAR_TAGS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVariable(v)}
                className="px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-surface text-cat-blue-fg border border-cat-blue/30 hover:bg-cat-blue-bg cursor-pointer"
              >
                {v}
              </button>
            ))}
          </div>
        )}

        <Textarea
          id="end-note"
          maxLength={200}
          value={note}
          rows={3}
          onChange={(e) => {
            setNote(e.target.value);
            commit({ outcome, note: e.target.value });
          }}
          placeholder={t("Ex: Cliente concluiu o funil de boas-vindas com sucesso.")}
          className="text-xs resize-none"
        />
        <div className="flex justify-between text-[10px] text-text-subtle">
          <span>{t("Fica gravado no histórico da inscrição")}</span>
          <span>{note.length}/200</span>
        </div>
      </div>

      {error && <p className="text-xs text-cat-red">{error}</p>}
    </div>
  );
}
