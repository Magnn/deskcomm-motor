"use client";

import { useState, useRef, useEffect, useCallback } from "react";

import type { FlowNode } from "@/lib/followup/graph-schema";
import type { RFNode, RFNodeData } from "@/lib/followup/graph-mappers";
import { Check, Trash, X } from "@/lib/ui/icons";
import { SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

import { ActionForm } from "./forms/ActionForm";
import { ClassifyForm } from "./forms/ClassifyForm";
import { ConditionForm } from "./forms/ConditionForm";
import { EndForm } from "./forms/EndForm";
import { MatchReplyForm } from "./forms/MatchReplyForm";
import { MenuForm } from "./forms/MenuForm";
import { AttendantRouteForm } from "./forms/AttendantRouteForm";
import { RepeatForm } from "./forms/RepeatForm";
import { WaitForm } from "./forms/WaitForm";
import { AbSplitForm } from "./forms/AbSplitForm";
import { AiGenericForm } from "./forms/AiGenericForm";
import { ApiCallForm } from "./forms/ApiCallForm";
import { NotifyAgentForm } from "./forms/NotifyAgentForm";
import { AddNoteForm } from "./forms/AddNoteForm";
import { CollectForm } from "./forms/CollectForm";
import { AgentForm } from "./forms/AgentForm";
import { SkillForm } from "./forms/SkillForm";
import { TriggerForm } from "./forms/TriggerForm";
import type { ConfigOf } from "./forms/shared";
import { NODE_VISUALS } from "./nodes/nodeVisuals";

interface Props {
  node: RFNode;
  /** Dono da mídia do nó Conteúdo — o upload é por FLUXO, não por conversa (ver content-media/route.ts). */
  flowId: string;
  onChange: (patch: Partial<RFNodeData>) => void;
  onDelete: () => void;
  onClose?: () => void;
  /** Ramos deste nó que já têm aresta — quem sabe isso é o canvas, que é dono do grafo. */
  ramosLigados?: string[];
}

/**
 * Inspector unificado no padrão AcassIA / Lalla para TODOS os nós do fluxo:
 * - Cabeçalho com título editável inline, botão de renomear e fechar.
 * - Subtítulo com categoria do nó e "CONFIGURAR PARÂMETROS".
 * - Barra de alterações não salvas (dot pulsante âmbar) quando há dados modificados.
 * - Corpo específico de cada nó com formulários e controles enriquecidos.
 * - Rodapé fixo com botão verde "✓ Salvar Alterações" e botão "Excluir nó".
 */
export function NodeConfigPanel({ node, flowId, onChange, onDelete, onClose, ramosLigados }: Props) {
  const t = useT();
  const type = node.type as FlowNode["type"];
  const visual = NODE_VISUALS[type];
  const Icon = visual.icon;

  // Estado de edição do título inline
  const [editingTitle, setEditingTitle] = useState(false);
  const [label, setLabel] = useState(node.data.label || t(visual.paletteLabel));
  const inputRef = useRef<HTMLInputElement>(null);

  // Rastreamento de alterações não salvas (dirty state)
  const snapshotRef = useRef<string>(JSON.stringify(node.data));
  const [isDirty, setIsDirty] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  useEffect(() => {
    snapshotRef.current = JSON.stringify(node.data);
    setLabel(node.data.label || t(visual.paletteLabel));
    setIsDirty(false);
    setEditingTitle(false);
  }, [node.id, node.type, t, visual.paletteLabel]);

  useEffect(() => {
    const current = JSON.stringify(node.data);
    setIsDirty(current !== snapshotRef.current);
  }, [node.data]);

  useEffect(() => {
    if (editingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTitle]);

  const confirmRename = useCallback(() => {
    const trimmed = label.trim();
    if (trimmed && trimmed !== node.data.label) {
      onChange({ label: trimmed });
    }
    setEditingTitle(false);
  }, [label, node.data.label, onChange]);

  const handleSave = () => {
    snapshotRef.current = JSON.stringify(node.data);
    setIsDirty(false);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  return (
    <div
      className="flex h-full flex-col min-h-0 bg-white dark:bg-zinc-950 font-sans text-text select-text"
      data-testid="node-config-panel"
    >
      {/* Cabeçalho AcassIA: Título inline + Botão de renomear roxo */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-zinc-800 shrink-0 min-h-[52px] bg-white dark:bg-zinc-950">
        {editingTitle ? (
          <div className="flex items-center gap-1.5 flex-1 mr-2">
            <input
              ref={inputRef}
              type="text"
              value={label}
              maxLength={60}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") {
                  setLabel(node.data.label || t(visual.paletteLabel));
                  setEditingTitle(false);
                }
              }}
              onBlur={confirmRename}
              className="flex-1 text-[15px] font-bold text-slate-900 dark:text-zinc-100 tracking-tight border border-purple-500 rounded-lg px-2.5 py-1 outline-hidden focus:ring-2 focus:ring-purple-500/30 bg-slate-50 dark:bg-zinc-900"
            />
          </div>
        ) : (
          <span className="text-[15px] font-bold text-slate-800 dark:text-zinc-100 tracking-tight truncate">
            {label || t(visual.paletteLabel)}
          </span>
        )}

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="p-1.5 rounded-md border border-purple-200 text-[#9333ea] bg-purple-50/50 hover:bg-purple-100/50 transition-colors cursor-pointer dark:border-purple-900/60 dark:bg-purple-950/30 dark:text-purple-400"
            title={editingTitle ? t("Confirmar") : t("Renomear")}
            onClick={() => {
              if (editingTitle) confirmRename();
              else setEditingTitle(true);
            }}
          >
            {editingTitle ? (
              <Check size={15} className="text-emerald-600" weight="bold" />
            ) : (
              <SquarePen className="w-4 h-4 text-[#9333ea]" />
            )}
          </button>

          {onClose && (
            <button
              type="button"
              className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 flex items-center justify-center transition-colors cursor-pointer"
              title={t("Fechar painel")}
              onClick={onClose}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>

      {/* Indicador de alterações não salvas (AcassIA dirty indicator) */}
      {isDirty && (
        <div className="px-5 py-1.5 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200/60 dark:border-amber-900/40 flex items-center gap-2 shrink-0 animate-in fade-in duration-150">
          <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
            {t("Alterações não salvas")}
          </span>
        </div>
      )}

      {/* Corpo com formulário específico de cada nó */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {type === "action" && (
          <ActionForm
            config={node.data.config as ConfigOf<"action">}
            flowId={flowId}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "trigger" && (
          <TriggerForm
            config={node.data.config as Record<string, unknown>}
            onChange={(config) => onChange({ config: config as FlowNode["config"] })}
          />
        )}
        {type === "wait" && (
          <WaitForm config={node.data.config as ConfigOf<"wait">} onChange={(config) => onChange({ config })} />
        )}
        {type === "condition" && (
          <ConditionForm
            config={node.data.config as ConfigOf<"condition">}
            onChange={(config) => onChange({ config })}
            ramosLigados={ramosLigados}
          />
        )}
        {type === "ai_classify" && (
          <ClassifyForm
            config={node.data.config as ConfigOf<"ai_classify">}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "match_reply" && (
          <MatchReplyForm
            config={node.data.config as ConfigOf<"match_reply">}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "menu" && (
          <MenuForm config={node.data.config as ConfigOf<"menu">} onChange={(config) => onChange({ config })} />
        )}
        {type === "attendant_route" && (
          <AttendantRouteForm
            config={node.data.config as ConfigOf<"attendant_route">}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "repeat" && (
          <RepeatForm
            config={node.data.config as ConfigOf<"repeat">}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "end" && (
          <EndForm config={node.data.config as ConfigOf<"end">} onChange={(config) => onChange({ config })} />
        )}
        {type === "ab_split" && (
          <AbSplitForm config={node.data.config as ConfigOf<"ab_split">} onChange={(config) => onChange({ config })} />
        )}
        {type === "ai_generic" && (
          <AiGenericForm config={node.data.config as ConfigOf<"ai_generic">} onChange={(config) => onChange({ config })} />
        )}
        {type === "api_call" && (
          <ApiCallForm config={node.data.config as ConfigOf<"api_call">} onChange={(config) => onChange({ config })} />
        )}
        {type === "notify_agent" && (
          <NotifyAgentForm
            config={node.data.config as ConfigOf<"notify_agent">}
            onChange={(config) => onChange({ config })}
          />
        )}
        {type === "add_note" && (
          <AddNoteForm config={node.data.config as ConfigOf<"add_note">} onChange={(config) => onChange({ config })} />
        )}
        {type === "collect" && (
          <CollectForm config={node.data.config as ConfigOf<"collect">} onChange={(config) => onChange({ config })} />
        )}
        {type === "agent" && (
          <AgentForm config={node.data.config as ConfigOf<"agent">} onChange={(config) => onChange({ config })} />
        )}
        {type === "skill" && (
          <SkillForm config={node.data.config as ConfigOf<"skill">} onChange={(config) => onChange({ config })} />
        )}
      </div>

      {/* Rodapé fixo: Botão Salvar Verde AcassIA + Excluir Nó */}
      <footer className="px-5 py-3 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0 space-y-2">
        <button
          type="button"
          onClick={handleSave}
          className="w-full py-2.5 rounded-lg bg-[#70b300] hover:bg-[#629c00] active:scale-[0.99] text-white font-semibold text-sm shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer select-none"
        >
          {savedFeedback ? (
            <>
              <Check size={16} weight="bold" />
              <span>{t("Dados Salvos!")}</span>
            </>
          ) : (
            <span>{t("Salvar Dados")}</span>
          )}
        </button>

        <div className="text-center pt-0.5">
          <button
            type="button"
            data-testid="delete-node"
            onClick={onDelete}
            className="text-xs text-slate-400 hover:text-rose-600 transition-colors inline-flex items-center justify-center gap-1.5 py-1 cursor-pointer w-full"
          >
            <Trash size={13} aria-hidden />
            {t("Excluir nó")}
          </button>
        </div>
      </footer>
    </div>
  );
}
