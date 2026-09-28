"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { NODE_VISUAL_LIST, type NodeVisual } from "./nodes/nodeVisuals";

interface Props {
  onAdd: (type: NodeType) => void;
  /** "mobile" = mesmo conteúdo dentro do Sheet que `FlowCanvas` abre abaixo de
   * `lg` — a barra fixa de 224px não cabia perto do canvas num celular. */
  variant?: "desktop" | "mobile";
}

/**
 * Agrupamento por categoria — inspirado no construtor da AcassIA (ver
 * [[acassia-frontend-fluxos-e-agente]]): cada grupo é um cabeçalho pequeno em
 * maiúsculas, e cada item mostra ícone + rótulo + uma linha dizendo o que o
 * nó faz. Filtra pelo que `NODE_VISUAL_LIST` realmente traz — um tipo que sai
 * da superfície do motor some do grupo sozinho, sem lista para manter em dia.
 */
const GRUPOS: ReadonlyArray<{ titulo: string; selo: string; tipos: readonly NodeType[] }> = [
  { titulo: "Início & fim", selo: "Fluxo", tipos: ["trigger", "end"] },
  { titulo: "Mensagens", selo: "Mensagem", tipos: ["action", "menu", "collect", "skill"] },
  { titulo: "Inteligência artificial", selo: "IA", tipos: ["agent", "ai_classify", "ai_generic"] },
  {
    titulo: "Lógica & roteamento",
    selo: "Lógica",
    tipos: ["condition", "match_reply", "attendant_route", "repeat", "ab_split", "wait"],
  },
  {
    titulo: "Ações & integrações",
    selo: "Integração",
    tipos: ["api_call", "notify_agent", "add_note"],
  },
];

/** Sidebar palette — click to add. Native HTML5 drag-and-drop wired in FlowCanvas (increment 3). */
export function NodePalette({ onAdd, variant = "desktop" }: Props) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const isMobile = variant === "mobile";
  const disponiveis = new Map(NODE_VISUAL_LIST.map((v) => [v.type, v]));
  const termo = busca.trim().toLocaleLowerCase();
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo,
    selo: g.selo,
    itens: g.tipos
      .map((tipo) => disponiveis.get(tipo))
      .filter((v): v is NodeVisual => v !== undefined)
      .filter(
        (visual) =>
          !termo ||
          `${t(visual.paletteLabel)} ${t(visual.paletteDesc)}`.toLocaleLowerCase().includes(termo),
      ),
  })).filter((g) => g.itens.length > 0);

  return (
    <aside
      className={cn(
        "flex flex-col gap-4 overflow-y-auto p-3",
        isMobile
          ? "h-full w-full"
          : "hidden w-64 shrink-0 border-r border-border bg-surface lg:flex",
      )}
      data-testid="node-palette"
    >
      <div className="space-y-3">
        <h2 className="px-1 text-sm font-semibold text-text">{t("Menu de opções")}</h2>
        <div className="relative">
          <MagnifyingGlass
            size={14}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted"
          />
          <Input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder={t("Buscar opção")}
            aria-label={t("Buscar opção")}
            className="h-9 pl-9 text-xs"
            data-testid="node-palette-search"
          />
        </div>
      </div>
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[10px] font-semibold tracking-wider text-text-subtle uppercase">
            {t(grupo.titulo)}
          </h3>
          {grupo.itens.map((visual) => (
            <PaletteItem
              key={visual.type}
              visual={visual}
              categoria={grupo.selo}
              onAdd={onAdd}
              t={t}
            />
          ))}
        </div>
      ))}
      {grupos.length === 0 && (
        <p className="px-1 text-xs text-text-muted">{t("Nenhuma opção encontrada.")}</p>
      )}
    </aside>
  );
}

function PaletteItem({
  visual,
  categoria,
  onAdd,
  t,
}: {
  visual: NodeVisual;
  categoria: string;
  onAdd: (type: NodeType) => void;
  t: (texto: string) => string;
}) {
  const Icon = visual.icon;
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
      className={cn(
        "group flex items-center gap-2.5 rounded-lg border border-border/70 bg-surface px-2.5 py-2 text-left shadow-none",
        "cursor-grab transition-all duration-150 hover:shadow-sm active:cursor-grabbing",
        visual.hoverBorderClassName,
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md shadow-sm",
          visual.chipClassName,
        )}
      >
        <Icon size={16} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs leading-tight font-semibold text-text">
          {t(visual.paletteLabel)}
        </span>
        <span className="truncate text-[10px] leading-tight text-text-muted">
          {t(visual.paletteDesc)}
        </span>
        <span
          className={cn(
            "mt-1 w-fit rounded-md px-1.5 py-0.5 text-[9px] leading-none font-medium",
            visual.badgeClassName,
          )}
        >
          {t(categoria)}
        </span>
      </div>
    </button>
  );
}
