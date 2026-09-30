"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { skillConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * Puxar uma skill instalada em paralelo ao passo do fluxo.
 */
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
    <div className="space-y-2">
      <Label htmlFor="skill-name">{t("Identificador da Skill")}</Label>
      <Input
        id="skill-name"
        maxLength={80}
        value={skillName}
        placeholder={t("ex: catalogo-apresentacao")}
        onChange={(e) => commit(e.target.value)}
      />
      <p className="text-xs text-text-muted">
        {t("Nome da skill registrada no sistema que será ativada neste ponto do atendimento.")}
      </p>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
