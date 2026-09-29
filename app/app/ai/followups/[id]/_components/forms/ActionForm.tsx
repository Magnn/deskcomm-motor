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
import { Check, PencilSimple, Trash, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

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
  onClose,
}: {
  config: ConfigOf<"action">;
  /** Dono da mídia do modo `content` — ver `ConteudoItemsEditor`. */
  flowId: string;
  onChange: (c: ConfigOf<"action">) => void;
  nodeLabel?: string;
  onLabelChange?: (label: string) => void;
  onDelete?: () => void;
  onClose?: () => void;
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
      {/* Cabeçalho AcassIA / Lalla: Título + "CONFIGURAR PARÂMETROS" + Botão Renomear + Fechar */}
      <div className="flex items-center justify-between pb-3.5 border-b border-zinc-200 dark:border-zinc-800 flex-shrink-0 min-h-[52px]">
        {editingTitle ? (
          <div className="flex items-center gap-1.5 flex-1 mr-2">
            <input
              type="text"
              value={tempTitle}
              onChange={(e) => setTempTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") salvarTitulo();
                if (e.key === "Escape") setEditingTitle(false);
              }}
              onBlur={salvarTitulo}
              autoFocus
              className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight border border-indigo-500 rounded-xl px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-500/30 bg-zinc-50 dark:bg-zinc-900"
            />
          </div>
        ) : (
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
              {nodeLabel || t("Conteúdo")}
            </span>
            <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">
              {t("Configurar Parâmetros")}
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="w-7 h-7 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
            title={editingTitle ? t("Confirmar") : t("Renomear")}
            onClick={() => {
              if (editingTitle) salvarTitulo();
              else {
                setTempTitle(nodeLabel || "Conteúdo");
                setEditingTitle(true);
              }
            }}
          >
            {editingTitle ? (
              <Check size={16} className="text-emerald-600" weight="bold" />
            ) : (
              <PencilSimple size={16} />
            )}
          </button>

          {onClose && (
            <button
              type="button"
              className="w-7 h-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors"
              title={t("Fechar painel")}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          )}
        </div>
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

      {/* Rodapé: Botão Salvar Alterações (AcassIA parity) */}
      <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
        <button
          type="button"
          onClick={handleSave}
          className={cn(
            "w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs select-none",
            savedFeedback
              ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 cursor-default"
              : "bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-emerald-500/20",
          )}
        >
          {savedFeedback ? (
            <>
              <Check size={14} weight="bold" aria-hidden />
              <span>{t("Configurações Salvas")}</span>
            </>
          ) : (
            <span>{t("✓ Salvar Alterações")}</span>
          )}
        </button>

        {onDelete && (
          <div className="text-center pt-1">
            <button
              type="button"
              data-testid="delete-node"
              onClick={onDelete}
              className="text-xs text-neutral-400 hover:text-rose-600 transition-colors inline-flex items-center gap-1 cursor-pointer"
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
