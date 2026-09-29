"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
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
import { actionConfigSchema, type ConteudoItem } from "@/lib/followup/graph-schema";
import { MODOS_DA_ACAO, opcoes, type ModoDaAcao } from "@/lib/followup/vocabulario";
import { useMessageTemplates } from "@/hooks/inbox/useMessageTemplates";
import { useT } from "@/hooks/i18n/useT";
import { Check, PencilSimple, Trash } from "@/lib/ui/icons";

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
  nodeLabel,
  onLabelChange,
  onDelete,
}: {
  config: ConfigOf<"action">;
  /** Dono da mídia do modo `content` — ver `ConteudoItemsEditor`. */
  flowId: string;
  onChange: (c: ConfigOf<"action">) => void;
  nodeLabel?: string;
  onLabelChange?: (label: string) => void;
  onDelete?: () => void;
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

  // Edição inline do título (lápis roxo)
  const [editingTitle, setEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(nodeLabel || "Conteúdo");
  const [savedFeedback, setSavedFeedback] = useState(false);

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

  const handleSave = () => {
    commit({ mode, ...fields });
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const salvarTitulo = () => {
    if (tempTitle.trim().length > 0 && onLabelChange) {
      onLabelChange(tempTitle.trim());
    }
    setEditingTitle(false);
  };

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Cabeçalho estilo Lalla: Título à esquerda, Lápis roxo à direita */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200 dark:border-neutral-800">
        {editingTitle ? (
          <div className="flex items-center gap-1.5 flex-1 mr-2">
            <Input
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvarTitulo();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              autoFocus
              className="h-8 text-sm font-semibold"
            />
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={salvarTitulo}>
              <Check size={14} weight="bold" />
            </Button>
          </div>
        ) : (
          <h2 className="text-base font-semibold text-neutral-800 dark:text-neutral-100 tracking-tight">
            {nodeLabel || t("Conteúdo")}
          </h2>
        )}

        <button
          type="button"
          onClick={() => {
            if (editingTitle) salvarTitulo();
            else {
              setTempTitle(nodeLabel || "Conteúdo");
              setEditingTitle(true);
            }
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 transition-colors"
          title={t("Editar nome do nó")}
        >
          <PencilSimple size={14} weight="bold" aria-hidden />
        </button>
      </div>

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
              <Label htmlFor="action-body">{t("Texto enviado ao contato")}</Label>
              <Textarea
                id="action-body"
                maxLength={4000}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  commit({ mode, ...fields, body: e.target.value });
                }}
              />
            </div>
          )}

          {mode === "ai_message" && (
            <div className="space-y-2">
              <Label htmlFor="action-prompt-hint">{t("Instrução para a IA")}</Label>
              <Textarea
                id="action-prompt-hint"
                maxLength={1000}
                value={promptHint}
                onChange={(e) => {
                  setPromptHint(e.target.value);
                  commit({ mode, ...fields, promptHint: e.target.value });
                }}
              />
              <Label htmlFor="action-fallback">{t("Modelo de contingência")}</Label>
              <SeletorDeModelo
                id="action-fallback"
                valor={fallbackTemplateId}
                permiteVazio
                onChange={(v) => {
                  setFallbackTemplateId(v);
                  commit({ mode, ...fields, fallbackTemplateId: v });
                }}
              />
            </div>
          )}

          {mode === "template" && (
            <div className="space-y-2">
              <Label htmlFor="action-template-id">{t("Modelo de mensagem")}</Label>
              <SeletorDeModelo
                id="action-template-id"
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

      {/* Rodapé: Botão Salvar Dados Verde (Lalla) */}
      <div className="mt-auto pt-4 space-y-2">
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-3 px-4 rounded-xl bg-[#68a700] hover:bg-[#5b9200] active:scale-[0.99] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 select-none"
        >
          {savedFeedback ? (
            <>
              <Check size={16} weight="bold" aria-hidden />
              <span>{t("Dados Salvos!")}</span>
            </>
          ) : (
            <span>{t("Salvar Dados")}</span>
          )}
        </button>

        {onDelete && (
          <div className="text-center pt-1">
            <button
              type="button"
              data-testid="delete-node"
              onClick={onDelete}
              className="text-xs text-neutral-400 hover:text-rose-600 transition-colors inline-flex items-center gap-1"
            >
              <Trash size={12} aria-hidden />
              {t("Excluir nó")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
