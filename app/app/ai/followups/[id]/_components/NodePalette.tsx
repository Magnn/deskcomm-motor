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
   * `lg` — a barra fixa não cabia perto do canvas num celular. */
  variant?: "desktop" | "mobile";
}

/**
 * Ordem exata da paleta — reflete a referência visual do produto.
 * Lista única sem separadores de grupo, do mais usado ao mais especializado.
 */
const ORDEM_PALETA: readonly NodeType[] = [
  "menu",
  "action", // Conteúdo
  "collect", // Pergunta
  "whatsapp_template", // Template WhatsApp (Meta)
  "voice_studio", // Voice Studio (Áudio IA)
  "api_call", // API Request
  "pix_payment", // PIX
  "payment_gateway", // Pagamento
  "meta_pixel", // Pixel Meta
  "wait", // Delay
  "condition", // Condição
  "notify_agent", // Notificar Atendente
  "ab_split", // Divisão
  "attendant_route", // Divisão de Atendentes
  "ai_generic", // GPT
  "agent", // Agente IA
  "ai_classify", // Classificar
  "match_reply", // Resposta (texto)
  "add_note", // Anotação
  "repeat",
  "trigger",
  "end",
  "skill",
];

/** Tipos com badge "Popular" */
const POPULARES = new Set<NodeType>(["action", "collect", "api_call", "condition"]);
/** Tipos com badge "Novidade" */
const NOVIDADES = new Set<NodeType>([
  "attendant_route",
  "agent",
  "pix_payment",
  "payment_gateway",
  "whatsapp_template",
  "meta_pixel",
  "voice_studio",
]);

/** Sidebar palette — click to add. Native HTML5 drag-and-drop wired in FlowCanvas (increment 3). */
export function NodePalette({ onAdd, onClose, variant = "desktop" }: Props) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const isMobile = variant === "mobile";
  const disponiveis = new Map(NODE_VISUAL_LIST.map((v) => [v.type, v]));
  const termo = busca.trim().toLocaleLowerCase();
  const itens = ORDEM_PALETA.map((tipo) => disponiveis.get(tipo))
    .filter((v): v is NodeVisual => v !== undefined)
    .filter(
      (visual) =>
        !termo ||
        [t(visual.paletteLabel), t(visual.paletteDesc)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(termo),
    );

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col border-r border-border bg-white select-none dark:bg-neutral-900",
        isMobile ? "w-full" : "w-[285px]",
      )}
      data-testid="node-palette"
    >
      {/* Cabeçalho */}
      <div className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-4 py-3.5 dark:border-neutral-800">
        <h2 className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
          {t("Menu de opções")}
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("Fechar menu")}
            title={t("Fechar menu")}
            className="cursor-pointer rounded-lg p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={18} aria-hidden />
          </button>
        )}
      </div>

      {/* Busca */}
      <div className="relative shrink-0 px-3 pt-3 pb-2">
        <MagnifyingGlass
          size={14}
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-neutral-400"
        />
        <Input
          type="search"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder={t("Buscar opção")}
          aria-label={t("Buscar opção")}
          className="h-8 rounded-lg border-neutral-200 bg-neutral-50 pl-8 text-xs placeholder:text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800/80"
          data-testid="node-palette-search"
        />
      </div>

      {/* Lista com barra de rolagem visível e espaçamento generoso */}
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-4">
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
      className="group relative flex w-full cursor-grab items-start gap-3 rounded-xl border border-neutral-200/90 bg-white p-2.5 text-left shadow-xs transition-all duration-150 hover:border-violet-300 hover:bg-neutral-50/60 hover:shadow-sm active:cursor-grabbing dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-violet-600 dark:hover:bg-neutral-800/60"
    >
      {/* Ícone colorido e proporcional */}
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
          visual.paletteIconClassName,
        )}
      >
        <Icon size={22} aria-hidden />
      </span>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Linha 1: nome + badge */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-100">
            {t(visual.paletteLabel)}
          </span>
          {isPopular && (
            <span className="shrink-0 rounded-full border border-neutral-200/70 bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
              {t("Popular")}
            </span>
          )}
          {isNovidade && (
            <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white shadow-xs">
              {t("Novidade")}
            </span>
          )}
        </div>

        {/* Linha 2: descrição */}
        <span className="mt-0.5 truncate text-[11px] text-neutral-400 dark:text-neutral-500">
          {t(visual.paletteDesc)}
        </span>
      </div>
    </button>
  );
}
