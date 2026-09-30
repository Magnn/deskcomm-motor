"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { PuzzlePiece, Info, Check } from "@/lib/ui/icons";
import type { ConfigOf } from "./shared";

const SKILL_SUGGESTIONS = [
  { id: "catalogo-produtos", label: "Catálogo de Produtos", desc: "Apresenta fotos, preços e categorias" },
  { id: "consulta-cpf", label: "Consulta de CPF/CNPJ", desc: "Validação em tempo real" },
  { id: "calculo-frete", label: "Cálculo de Frete", desc: "Cotação automática por CEP" },
  { id: "agendamento-consulta", label: "Agendamento", desc: "Reserva de slots e confirmação" },
  { id: "qualificacao-lead", label: "Qualificação de Lead", desc: "Perguntas de perfil e scoring" },
];

export function SkillForm({
  config,
  onChange,
}: {
  config: ConfigOf<"skill">;
  onChange: (c: ConfigOf<"skill">) => void;
}) {
  const t = useT();
  const [skillName, setSkillName] = useState(config.skill_name);
  const [error, setError] = useState<string | null>(null);

  const commit = (value: string) => {
    setSkillName(value);
    const parsed = skillConfigSchema.safeParse({ skill_name: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Nome de skill inválido."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header banner sofisticado */}
      <div className="flex items-center gap-2.5 rounded-lg border border-orange-200 bg-orange-50/70 p-3 text-orange-950 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-600 text-white shadow-2xs">
          <PuzzlePiece size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Habilidade (Skill)")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Executa uma ferramenta registrada no sistema paralelamente")}
          </p>
        </div>
      </div>

      {/* Input com campo de texto */}
      <div className="space-y-1.5">
        <Label htmlFor="skill-name" className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Identificador da Skill")}
        </Label>
        <Input
          id="skill-name"
          maxLength={80}
          value={skillName}
          placeholder={t("ex: catalogo-produtos")}
          onChange={(e) => commit(e.target.value)}
          className="h-9 font-mono text-xs"
        />
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Identificador único da skill correspondente à rotina configurada no CRM.")}
        </p>
      </div>

      {/* Sugestões rápidas de Skills */}
      <div className="space-y-2 pt-1">
        <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300 block">
          {t("Skills sugeridas do sistema:")}
        </label>
        <div className="space-y-1.5">
          {SKILL_SUGGESTIONS.map((s) => {
            const isSelected = skillName === s.id;
            return (
              <div
                key={s.id}
                onClick={() => commit(s.id)}
                className={`p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between ${
                  isSelected
                    ? "border-orange-500 bg-orange-50/60 dark:bg-orange-950/30 dark:border-orange-700 shadow-2xs"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-zinc-800 dark:bg-zinc-900"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {s.label}
                    </span>
                    <code className="text-[10px] text-orange-700 dark:text-orange-400 bg-orange-100/70 dark:bg-orange-950/60 px-1 py-0.2 rounded font-mono">
                      {s.id}
                    </code>
                  </div>
                  <p className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
                    {s.desc}
                  </p>
                </div>
                {isSelected && (
                  <Check size={14} weight="bold" className="text-orange-600 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
    </div>
  );
}
