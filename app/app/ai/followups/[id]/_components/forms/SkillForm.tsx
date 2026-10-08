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
      <div className="flex items-center gap-2.5 rounded-lg border border-cat-amber/30 bg-cat-amber-bg p-3 text-cat-amber-fg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cat-amber text-white shadow-2xs">
          <PuzzlePiece size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Habilidade (Skill)")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Executa uma ferramenta registrada no sistema paralelamente")}
          </p>
        </div>
      </div>

      {/* Input com campo de texto */}
      <div className="space-y-1.5">
        <Label htmlFor="skill-name" className="text-[11px] font-semibold text-text-muted">
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
        <p className="text-[11px] text-text-muted">
          {t("Identificador único da skill correspondente à rotina configurada no CRM.")}
        </p>
      </div>

      {/* Sugestões rápidas de Skills */}
      <div className="space-y-2 pt-1">
        <label className="text-[11px] font-semibold text-text-muted block">
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
                    ? "border-cat-amber bg-cat-amber-bg shadow-2xs"
                    : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-text">
                      {s.label}
                    </span>
                    <code className="text-[10px] text-cat-amber-fg bg-cat-amber-bg px-1 py-0.2 rounded-md font-mono">
                      {s.id}
                    </code>
                  </div>
                  <p className="text-[10px] text-text-subtle mt-0.5">
                    {s.desc}
                  </p>
                </div>
                {isSelected && (
                  <Check size={14} weight="bold" className="text-cat-amber shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-xs text-cat-red font-medium">{error}</p>}
    </div>
  );
}
