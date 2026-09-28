"use client";

import { cn } from "@/lib/utils";
import type { NodeType } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
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
const GRUPOS: ReadonlyArray<{ titulo: string; tipos: readonly NodeType[] }> = [
  { titulo: "Início & fim", tipos: ["trigger", "end"] },
  { titulo: "Mensagens", tipos: ["action", "collect", "skill"] },
  { titulo: "Inteligência artificial", tipos: ["agent", "ai_classify", "ai_generic"] },
  { titulo: "Lógica & roteamento", tipos: ["condition", "match_reply", "repeat", "ab_split", "wait"] },
  { titulo: "Ações & integrações", tipos: ["api_call", "notify_agent", "add_note"] },
];

/** Sidebar palette — click to add. Native HTML5 drag-and-drop wired in FlowCanvas (increment 3). */
export function NodePalette({ onAdd, variant = "desktop" }: Props) {
  const t = useT();
  const isMobile = variant === "mobile";
  const disponiveis = new Map(NODE_VISUAL_LIST.map((v) => [v.type, v]));
  const grupos = GRUPOS.map((g) => ({
    titulo: g.titulo,
    itens: g.tipos.map((tipo) => disponiveis.get(tipo)).filter((v): v is NodeVisual => v !== undefined),
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
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
        {t("Adicionar nó")}
      </h2>
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1.5">
          <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
            {t(grupo.titulo)}
          </h3>
          {grupo.itens.map((visual) => (
            <PaletteItem key={visual.type} visual={visual} onAdd={onAdd} t={t} />
          ))}
        </div>
      ))}
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
        "group flex items-center gap-2.5 rounded-xl border border-border/70 bg-surface px-2.5 py-2 text-left shadow-none",
        "cursor-grab transition-all duration-150 active:cursor-grabbing hover:shadow-sm",
        visual.hoverBorderClassName,
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm",
          visual.chipClassName,
        )}
      >
        <Icon size={16} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-semibold leading-tight text-text">{t(visual.paletteLabel)}</span>
        <span className="truncate text-[10px] leading-tight text-text-muted">{t(visual.paletteDesc)}</span>
      </div>
    </button>
  );
}
