"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
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
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="space-y-1.5">
        <Label htmlFor="collect-question">{t("Pergunta a ser enviada")}</Label>
        <Textarea
          id="collect-question"
          rows={3}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            commit({ question: e.target.value });
          }}
          placeholder={t("Ex: Qual é o seu nome completo?")}
          maxLength={400}
        />
        <p className="text-[11px] text-text-muted">
          {t("A pergunta que o lead receberá antes de coletar o campo.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="collect-key">{t("Nome do campo (chave)")}</Label>
          <Input
            id="collect-key"
            value={key}
            onChange={(e) => {
              const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
              setKey(val);
              commit({ key: val });
            }}
            placeholder="ex: cidade_lead"
            maxLength={60}
          />
          <p className="text-[10px] text-text-muted">
            {t("Letras minúsculas e _")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="collect-label">{t("Rótulo de exibição")}</Label>
          <Input
            id="collect-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              commit({ label: e.target.value });
            }}
            placeholder="ex: Cidade do Lead"
            maxLength={80}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="collect-type">{t("Tipo do dado coletado")}</Label>
        <Select
          value={fieldType}
          onValueChange={(val) => {
            const v = val as ContactFlowFieldType;
            setFieldType(v);
            commit({ type: v });
          }}
        >
          <SelectTrigger id="collect-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((ft) => (
              <SelectItem key={ft.value} value={ft.value}>
                {t(ft.label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {fieldType === "select" && (
        <div className="space-y-1.5">
          <Label htmlFor="collect-options">{t("Opções (separadas por vírgula)")}</Label>
          <Input
            id="collect-options"
            value={optionsStr}
            onChange={(e) => {
              setOptionsStr(e.target.value);
              const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
              commit({ options: opts });
            }}
            placeholder="Opção 1, Opção 2, Opção 3"
          />
        </div>
      )}

      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-medium text-slate-800 dark:text-neutral-200">{t("Resposta obrigatória")}</span>
            <span className="text-[10.5px] text-text-muted">{t("O fluxo aguarda a resposta antes de prosseguir.")}</span>
          </div>
          <Switch
            checked={required}
            onCheckedChange={(checked) => {
              setRequired(checked);
              commit({ required: checked });
            }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-medium text-slate-800 dark:text-neutral-200">{t("Permitir correção")}</span>
            <span className="text-[10.5px] text-text-muted">{t("Permite que o lead atualize o dado posteriormente.")}</span>
          </div>
          <Switch
            checked={permiteCorrecao}
            onCheckedChange={(checked) => {
              setPermiteCorrecao(checked);
              commit({ permite_correcao: checked });
            }}
          />
        </div>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
