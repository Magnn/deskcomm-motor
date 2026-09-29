"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { menuConfigSchema } from "@/lib/followup/graph-schema";
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="menu-prompt">{t("Pergunta do menu")}</Label>
        <Textarea
          id="menu-prompt"
          maxLength={1000}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            commit({ prompt: event.target.value, options, graceMin });
          }}
        />
      </div>
      <div className="space-y-2">
        <Label>{t("Opções")}</Label>
        {options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-center text-xs font-semibold text-text-muted">
              {index + 1}
            </span>
            <Input
              aria-label={`${t("Opção")} ${index + 1}`}
              maxLength={40}
              value={option.label}
              onChange={(event) => atualizarOpcao(index, event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t("Remover opção")} ${index + 1}`}
              disabled={options.length <= 2}
              onClick={() => {
                const next = options.filter((_, current) => current !== index);
                setOptions(next);
                commit({ prompt, options: next, graceMin });
              }}
            >
              <Trash size={14} aria-hidden />
            </Button>
          </div>
        ))}
        {options.length < 8 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const usados = new Set(options.map((option) => option.id));
              const next = [...options, { id: novoId(usados), label: "Nova opção" }];
              setOptions(next);
              commit({ prompt, options: next, graceMin });
            }}
          >
            <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar opção")}
          </Button>
        )}
        <p className="text-xs text-text-muted">
          {t("A pessoa pode responder com o número ou com o nome da opção.")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="menu-grace">{t("Esperar resposta por (minutos)")}</Label>
        <Input
          id="menu-grace"
          type="number"
          min={15}
          value={graceMin}
          onChange={(event) => {
            const next = Number(event.target.value);
            setGraceMin(next);
            commit({ prompt, options, graceMin: next });
          }}
        />
      </div>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
