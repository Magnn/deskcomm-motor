"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass, X } from "@/lib/ui/icons";
import { NODE_VISUAL_LIST, type NodeVisual } from "./nodes/nodeVisuals";

interface Props {
  onAdd: (type: NodeType) => void;
  onClose?: () => void;
  /** "mobile" = mesmo conteúdo dentro do Sheet que `FlowCanvas` abre abaixo de
   * `lg` — a barra fixa de 224px não cabia perto do canvas num celular. */
  variant?: "desktop" | "mobile";
}

/**
 * Ordem exata da paleta — reflete a referência visual do produto.
 * Lista única sem separadores de grupo, do mais usado ao mais especializado.
 */
const ORDEM_PALETA: readonly NodeType[] = [
  "menu",
  "action",    // Conteúdo
  "collect",   // Pergunta
  "wait",      // Delay
  "condition",
  "notify_agent",
  "ab_split",  // Divisão
  "attendant_route", // Divisão de Atendentes
  "api_call",  // API Request
  "ai_generic", // GPT
  "agent",     // Agente IA
  "ai_classify", // Classificar
  "match_reply", // Resposta (texto)
  "add_note",  // Anotação
  "repeat",
  "trigger",
  "end",
  "skill",
];

/** Tipos com badge "Popular" */
const POPULARES = new Set<NodeType>(["action", "collect", "condition"]);
/** Tipos com badge "Novidade" */
const NOVIDADES = new Set<NodeType>(["attendant_route", "agent"]);

/** Sidebar palette — click to add. Native HTML5 drag-and-drop wired in FlowCanvas (increment 3). */
export function NodePalette({ onAdd, onClose, variant = "desktop" }: Props) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const isMobile = variant === "mobile";
  const disponiveis = new Map(NODE_VISUAL_LIST.map((v) => [v.type, v]));
  const termo = busca.trim().toLocaleLowerCase();
  const itens = ORDEM_PALETA
    .map((tipo) => disponiveis.get(tipo))
    .filter((v): v is NodeVisual => v !== undefined)
    .filter(
      (visual) =>
        !termo ||
        [t(visual.paletteLabel), t(visual.paletteDesc)].join(" ").toLocaleLowerCase().includes(termo),
    );

  return (
    <aside
      className={cn(
        "flex flex-col overflow-y-auto",
        isMobile
          ? "h-full w-full"
          : "hidden w-[200px] shrink-0 border-r border-border bg-white dark:bg-neutral-900 lg:flex",
      )}
      data-testid="node-palette"
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {t("Menu de opções")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Fechar")}
            className="rounded p-0.5 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            <X size={16} aria-hidden />
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="relative px-3 pb-3">
        <MagnifyingGlass
          size={13}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-neutral-400"
        />
        <Input
          type="search"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder={t("Buscar opção")}
          aria-label={t("Buscar opção")}
          className="h-8 pl-8 text-xs bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 placeholder:text-neutral-400"
          data-testid="node-palette-search"
        />
      </div>

      {/* Lista */}
      <div className="flex flex-col px-2 pb-4">
        {itens.map((visual) => (
          <PaletteItem key={visual.type} visual={visual} onAdd={onAdd} t={t} />
        ))}
        {itens.length === 0 && (
          <p className="px-2 py-4 text-xs text-neutral-400">{t("Nenhuma opção encontrada.")}</p>
        )}
      </div>
    </aside>
  );
}

function PaletteItem({
  visual,
  onAdd,
  t,
}: {
  visual: NodeVisual;
  onAdd: (type: NodeType) => void;
  t: (texto: string) => string;
}) {
  const Icon = visual.icon;
  const isPopular = POPULARES.has(visual.type);
  const isNovidade = NOVIDADES.has(visual.type);

  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-followup-node-type", visual.type);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onAdd(visual.type)}
      data-testid={`palette-add-${visual.type}`}
      className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-grab active:cursor-grabbing"
    >
      {/* Ícone: 36x36, fundo neutro cinza, borda fina — exatamente como na referência */}
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          "border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800",
          "transition-colors group-hover:border-neutral-300 dark:group-hover:border-neutral-600",
          visual.paletteIconClassName,
        )}
      >
        <Icon size={18} aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Linha 1: nome + badge alinhados à direita */}
        <div className="flex items-center justify-between gap-1">
          <span className="truncate text-[13px] font-semibold leading-tight text-neutral-800 dark:text-neutral-100">
            {t(visual.paletteLabel)}
          </span>
          {isPopular && (
            <span className="shrink-0 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">
              {t("Popular")}
            </span>
          )}
          {isNovidade && (
            <span className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">
              {t("Novidade")}
            </span>
          )}
        </div>
        {/* Linha 2: descrição */}
        <span className="truncate text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
          {t(visual.paletteDesc)}
        </span>
      </div>
    </button>
  );
}