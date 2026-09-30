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
import { actionConfigSchema, type ConteudoItem } from "@/lib/followup/graph-schema";
import { MODOS_DA_ACAO, opcoes, type ModoDaAcao } from "@/lib/followup/vocabulario";
import { useMessageTemplates } from "@/hooks/inbox/useMessageTemplates";
import { useT } from "@/hooks/i18n/useT";

import { ConteudoItemsEditor } from "./ConteudoItemsEditor";
import type { ConfigOf } from "./shared";

function SeletorDeModelo({
  id,
  valor,
  onChange,
  permiteVazio,
}: {
  id: string;
  valor: string;
  onChange: (templateId: string) => void;
  permiteVazio: boolean;
}) {
  const t = useT();
  const { data: modelos, isLoading, isError } = useMessageTemplates();

  if (isLoading) return <p className="text-xs text-text-muted">{t("Carregando seus modelos…")}</p>;
  if (isError) {
    return (
      <p className="text-xs text-error-fg">
        {t("Não consegui carregar seus modelos de mensagem. Recarregue a página.")}
      </p>
    );
  }
  if (!modelos?.length) {
    return (
      <p className="text-xs text-text-muted">
        {t("Você ainda não tem modelos de mensagem. Crie um em Ajustes → Modelos e ele aparece aqui.")}
      </p>
    );
  }

  const SEM_MODELO = "__nenhum__";
  return (
    <Select
      value={valor === "" ? SEM_MODELO : valor}
      onValueChange={(v) => onChange(v === SEM_MODELO ? "" : v)}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={t("Escolha um modelo")} />
      </SelectTrigger>
      <SelectContent>
        {permiteVazio && <SelectItem value={SEM_MODELO}>{t("Nenhum")}</SelectItem>}
        {modelos.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ActionForm({
  config,
  flowId,
  onChange,
}: {
  config: ConfigOf<"action">;
  /** Dono da mídia do modo `content` — ver `ConteudoItemsEditor`. */
  flowId: string;
  onChange: (c: ConfigOf<"action">) => void;
}) {
  const t = useT();
  const [mode, setMode] = useState<ModoDaAcao>(config.mode ?? "content");
  const [body, setBody] = useState(config.mode === "text" ? config.body : "");
  const [promptHint, setPromptHint] = useState(config.mode === "ai_message" ? config.prompt_hint : "");
  const [fallbackTemplateId, setFallbackTemplateId] = useState(
    config.mode === "ai_message" ? (config.fallback_template_id ?? "") : "",
  );
  const [templateId, setTemplateId] = useState(config.mode === "template" ? config.template_id : "");
  const [items, setItems] = useState<ConteudoItem[]>(config.mode === "content" ? config.items : []);
  const [error, setError] = useState<string | null>(null);

  const commit = (next: {
    mode: ModoDaAcao;
    body: string;
    promptHint: string;
    fallbackTemplateId: string;
    templateId: string;
    items: ConteudoItem[];
  }) => {
    const candidate =
      next.mode === "text"
        ? { mode: "text" as const, body: next.body }
        : next.mode === "ai_message"
          ? {
              mode: "ai_message" as const,
              prompt_hint: next.promptHint,
              ...(next.fallbackTemplateId.trim() ? { fallback_template_id: next.fallbackTemplateId } : {}),
            }
          : next.mode === "template"
            ? { mode: "template" as const, template_id: next.templateId }
            : { mode: "content" as const, items: next.items };
    const parsed = actionConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const fields = { body, promptHint, fallbackTemplateId, templateId, items };

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Modo de conteúdo (Lalla padrão) */}
      {mode === "content" ? (
        <ConteudoItemsEditor
          flowId={flowId}
          items={items}
          onChange={(next) => {
            setItems(next);
            commit({ mode, ...fields, items: next });
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="action-mode">{t("Como escrever a mensagem")}</Label>
            <Select
              value={mode}
              onValueChange={(v) => {
                const next = v as ModoDaAcao;
                setMode(next);
                commit({ mode: next, ...fields });
              }}
            >
              <SelectTrigger id="action-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opcoes(MODOS_DA_ACAO).map(({ valor, rotulo }) => (
                  <SelectItem key={valor} value={valor}>
                    {t(rotulo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "text" && (
            <div className="space-y-2">
              <Label htmlFor="action-body">{t("Mensagem")}</Label>
              <Textarea
                id="action-body"
                maxLength={4000}
                rows={6}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  commit({ mode, ...fields, body: e.target.value });
                }}
              />
            </div>
          )}

          {mode === "ai_message" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="action-prompt">{t("Orientação para a IA")}</Label>
                <Textarea
                  id="action-prompt"
                  maxLength={1000}
                  rows={4}
                  value={promptHint}
                  onChange={(e) => {
                    setPromptHint(e.target.value);
                    commit({ mode, ...fields, promptHint: e.target.value });
                  }}
                  placeholder={t(
                    "Ex: Convide para uma conversa sobre o imóvel X, com tom amigável e direto.",
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="action-fallback">{t("Modelo reserva (opcional)")}</Label>
                <SeletorDeModelo
                  id="action-fallback"
                  valor={fallbackTemplateId}
                  permiteVazio
                  onChange={(v) => {
                    setFallbackTemplateId(v);
                    commit({ mode, ...fields, fallbackTemplateId: v });
                  }}
                />
                <p className="text-xs text-text-muted">
                  {t("Usado se a IA falhar ao gerar a mensagem.")}
                </p>
              </div>
            </div>
          )}

          {mode === "template" && (
            <div className="space-y-2">
              <Label htmlFor="action-template">{t("Modelo de mensagem")}</Label>
              <SeletorDeModelo
                id="action-template"
                valor={templateId}
                permiteVazio={false}
                onChange={(v) => {
                  setTemplateId(v);
                  commit({ mode, ...fields, templateId: v });
                }}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
