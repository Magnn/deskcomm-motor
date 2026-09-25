"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aiGenericConfigSchema, type ReplySaveTo } from "@/lib/followup/graph-schema";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { usePipelines } from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * IA genérica — referência da pesquisa (AcassIA `gpt`): 1 nó simples, campo de
 * prompt + variável de saída. SEM seletor de modelo por nó de propósito: o
 * modelo é resolvido pelo PONTO DE IA `followup_generic_ai` (Configurações →
 * Provedores), o mesmo mecanismo que `ai_classify` já usa — um seletor aqui
 * duplicaria essa configuração em vez de reaproveitá-la.
 */
export function AiGenericForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ai_generic">;
  onChange: (c: ConfigOf<"ai_generic">) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState(config.prompt);
  const [saveTo, setSaveTo] = useState<ReplySaveTo>(config.save_to);
  const [error, setError] = useState<string | null>(null);
  const pipelines = usePipelines();
  const campos = (pipelines.data?.data ?? []).flatMap((p) => camposDoFunil(p.settings));
  const camposUnicos = [...new Map(campos.map((c) => [c.key, c])).values()];

  const commit = (next: { prompt: string; saveTo: ReplySaveTo }) => {
    const parsed = aiGenericConfigSchema.safeParse({ prompt: next.prompt, save_to: next.saveTo });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="ai-generic-prompt">{t("Instrução para a IA")}</Label>
        <Textarea
          id="ai-generic-prompt"
          maxLength={2000}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            commit({ prompt: e.target.value, saveTo });
          }}
        />
        <p className="text-xs text-text-muted">
          {t("A IA lê a conversa do lead e segue esta instrução — nunca fala com o cliente diretamente.")}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ai-generic-save">{t("Gravar o resultado em")}</Label>
        <Select
          value={
            saveTo.kind === "contact_name"
              ? "__contact_name__"
              : camposUnicos.some((c) => c.key === saveTo.key)
                ? saveTo.key
                : "__livre__"
          }
          onValueChange={(v) => {
            const next: ReplySaveTo =
              v === "__contact_name__"
                ? { kind: "contact_name" }
                : v === "__livre__"
                  ? { kind: "lead_custom", key: "resultado_ia" }
                  : { kind: "lead_custom", key: v };
            setSaveTo(next);
            commit({ prompt, saveTo: next });
          }}
        >
          <SelectTrigger id="ai-generic-save">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__contact_name__">{t("Nome do contato")}</SelectItem>
            {camposUnicos.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label} ({c.key})
              </SelectItem>
            ))}
            <SelectItem value="__livre__">{t("Chave livre")}</SelectItem>
          </SelectContent>
        </Select>
        {saveTo.kind === "lead_custom" && !camposUnicos.some((c) => c.key === saveTo.key) && (
          <Input
            aria-label={t("Chave do campo personalizado")}
            value={saveTo.key}
            onChange={(e) => {
              const next: ReplySaveTo = { kind: "lead_custom", key: e.target.value };
              setSaveTo(next);
              commit({ prompt, saveTo: next });
            }}
          />
        )}
        <p className="text-xs text-text-muted">
          {t("Crie os campos em Configurações → Funis. O valor grava toda vez que o nó rodar (sempre sobrescreve).")}
        </p>
      </div>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
