"use client";

import type { ComponentType } from "react";

import { Handle, Position } from "@xyflow/react";

import type { FlowBranch } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { NomesDeValor } from "@/lib/followup/vocabulario";
import { ArrowRight, Warning, WarningOctagon, Play, Copy, PencilSimple } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { useEtapasDoFluxo } from "../EtapasDoFluxo";
import type { NodeVisual } from "./nodeVisuals";

/** Bolinha de conexão — maior e colorida por tipo, nunca o ponto cinza padrão do React Flow. */
const HANDLE_BASE =
  "!h-3.5 !w-3.5 !rounded-full !border-2 !border-surface !shadow-sm !transition-all hover:!scale-125";

/**
 * A regra de etapa que não aponta para etapa ativa nenhuma: o nome digitado à
 * mão antes do seletor ("PAGO"), ou uma etapa apagada/arquivada. O motor compara
 * o `stage_id`, então essa saída nunca é tomada — e o card é onde o dono olha
 * sem abrir nada. `null` do resolvedor é "não existe"; reticências (lista ainda
 * carregando) e resolvedor ausente não acusam.
 */
function regraSemEtapa(branch: FlowBranch, nomes: NomesDeValor): boolean {
  const check = branch.check;
  if (check === null || check.field !== "lead_stage") return false;
  const valor = String(check.value).trim();
  return valor !== "" && nomes.etapa?.(valor) === null;
}

interface Props {
  id: string;
  visual: NodeVisual;
  label: string;
  subtitle: string;
  selected?: boolean;
  errors?: string[];
  /** O Simulador marca aqui o nó em que a simulação está parada agora — feedback visual "turno a turno". */
  simulating?: boolean;
  showTarget?: boolean;
  showSource?: boolean;
  /**
   * As saídas do nó, quando ele tem mais de uma. Cada ramo vira UMA linha com
   * rótulo legível e a sua própria bolinha — era isso que faltava: com um handle
   * só não havia onde ligar "a aresta da regra 2", e desenhar bolinhas iguais
   * sem nome trocaria um problema por outro.
   */
  branches?: FlowBranch[];
  /**
   * A PRÉVIA REAL do conteúdo do nó (hoje só o modo `content` da Ação): uma
   * linha por item, ícone + texto — não uma frase descrevendo o nó. É a
   * mudança que mais eleva a leitura do card (achado da pesquisa de mercado:
   * Typebot/ManyChat mostram o conteúdo, não um rótulo genérico).
   */
  previewRows?: Array<{
    texto: string;
    Icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
    type?: string;
  }>;
}

/**
 * Shared card shell for every node type — a card, not a bare React Flow box:
 * icon chip + title + subtitle + connection handles, left border in the type's
 * accent. Red ring + inline message when `errors` is non-empty (publish 422
 * anchored to this node — Task 6.2 PublishBar wires this).
 *
 * ⚠️ SUBTÍTULO E SAÍDA QUEBRAM EM DUAS LINHAS, NÃO CORTAM. Eram `truncate` numa
 * linha só dentro de um card de 224px, e o que se perdia era sempre o FIM — que
 * é onde mora o valor da regra. "O fluxo já deu pelo menos 0 pas…" e "O lead não
 * está na etapa “Proposta enviada”" chegavam iguais na tela, e o card deixava de
 * responder "qual aresta sai de qual regra", que é a razão de ele existir. Duas
 * linhas cobrem toda frase do vocabulário (medido); o que ainda passar disso tem
 * o texto inteiro no `title`. O canvas mede o card pelo DOM (`FlowCanvas` passa
 * `measured` ao auto-layout), então o card mais alto não desalinha nada.
 */
const HEADER_BG_BY_TYPE: Record<string, string> = {
  action: "bg-[#7c3aed]",
  trigger: "bg-[#059669]",
  wait: "bg-[#ea580c]",
  condition: "bg-[#0284c7]",
  ai_classify: "bg-[#7c3aed]",
  match_reply: "bg-[#dc2626]",
  menu: "bg-[#0891b2]",
  repeat: "bg-[#0d9488]",
  collect: "bg-[#ea580c]",
  ab_split: "bg-[#db2777]",
  ai_generic: "bg-[#c026d3]",
  api_call: "bg-[#2563eb]",
  notify_agent: "bg-[#ca8a04]",
  add_note: "bg-[#d97706]",
  end: "bg-[#52525b]",
};

const BORDER_COLOR_BY_TYPE: Record<string, string> = {
  action: "!border-purple-600 text-purple-600",
  trigger: "!border-emerald-600 text-emerald-600",
  wait: "!border-orange-500 text-orange-500",
  condition: "!border-sky-600 text-sky-600",
  ai_classify: "!border-purple-600 text-purple-600",
  match_reply: "!border-red-600 text-red-600",
  menu: "!border-cyan-600 text-cyan-600",
  repeat: "!border-teal-600 text-teal-600",
  collect: "!border-orange-500 text-orange-500",
  ab_split: "!border-pink-600 text-pink-600",
  ai_generic: "!border-fuchsia-600 text-fuchsia-600",
  api_call: "!border-blue-600 text-blue-600",
  notify_agent: "!border-yellow-600 text-yellow-600",
  add_note: "!border-amber-600 text-amber-600",
  end: "!border-zinc-500 text-zinc-500",
};

export function NodeCard({
  id,
  visual,
  label,
  subtitle,
  selected,
  errors,
  simulating,
  showTarget = true,
  showSource = true,
  branches,
  previewRows,
}: Props) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const Icon = visual.icon;
  const hasError = (errors?.length ?? 0) > 0;
  const branchRows = branches !== undefined && branches.length > 1 ? branches : null;
  const headerBg = HEADER_BG_BY_TYPE[visual.type] ?? "bg-[#7c3aed]";
  const hasContentItems = previewRows !== undefined && previewRows.length > 0;
  const handleTopStyle = hasContentItems ? { top: "54px" } : { top: "50%" };

  return (
    <div
      className={cn(
        "group relative w-72 overflow-visible rounded-2xl border bg-surface font-sans shadow-md transition-all duration-200 select-none",
        visual.type === "action" ? "border-purple-300 dark:border-purple-800" : "border-border",
        selected
          ? cn("shadow-lg ring-2 ring-offset-1 ring-offset-bg", visual.selectedClassName)
          : cn("hover:border-border-strong hover:shadow-lg", visual.hoverBorderClassName),
        simulating && !hasError && "animate-pulse ring-2 ring-success ring-offset-1 ring-offset-bg",
        hasError && "border-error ring-2 ring-error ring-offset-1 ring-offset-bg",
      )}
      data-testid={`node-card-${id}`}
      data-simulating={simulating || undefined}
      title={hasError ? errors!.join("; ") : undefined}
    >
      {hasError && (
        <span
          aria-hidden
          className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white shadow-md"
        >
          <WarningOctagon size={12} weight="fill" aria-hidden />
        </span>
      )}

      {/* Entrada (Target) no lado ESQUERDO com seta estilizada */}
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "!-left-2.5 z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !bg-white !shadow-sm !transition-all hover:!scale-125",
            BORDER_COLOR_BY_TYPE[visual.type] ?? "!border-purple-600 text-purple-600",
          )}
          style={handleTopStyle}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5" />
        </Handle>
      )}

      {/* Cabeçalho sólido com botões de Duplicar e Editar */}
      <div
        className={cn(
          "flex items-center justify-between rounded-t-2xl px-3 py-2.5 text-white shadow-xs",
          headerBg,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Icon size={16} className="shrink-0 text-white" aria-hidden />
          <p
            className="truncate text-sm leading-tight font-semibold tracking-wide text-white"
            title={label}
          >
            {label}
          </p>
        </div>
        <div className="ml-1.5 flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title={t("Duplicar nó")}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("flow-duplicate-node", { detail: { id } }));
            }}
          >
            <Copy size={13} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded p-1 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            title={t("Editar nó")}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("flow-select-node", { detail: { id } }));
            }}
          >
            <PencilSimple size={13} aria-hidden />
          </button>
        </div>
      </div>

      {/* Subtítulo somente quando não há itens de prévia */}
      {(!previewRows || previewRows.length === 0) && (
        <div className="p-3">
          <p
            className="line-clamp-2 rounded-lg border border-border/60 bg-surface-elevated px-2.5 py-1.5 text-xs leading-relaxed break-words text-text-muted"
            title={subtitle}
          >
            {subtitle}
          </p>
        </div>
      )}

      {hasError && (
        <p
          className="border-t border-error/30 px-3 py-1.5 text-xs leading-snug text-error-fg"
          data-testid={`node-error-${id}`}
        >
          {errors![0]}
        </p>
      )}

      {/* Itens de conteúdo (Cards especializados: Delay, Texto, Áudio, etc.) */}
      {previewRows !== undefined && previewRows.length > 0 && (
        <ul className="flex flex-col gap-2 p-3" data-testid={`node-preview-${id}`}>
          {previewRows.map((row, i) => {
            if (row.type === "delay") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-rose-300 bg-[#fff5f5] px-3 py-2 text-rose-800 shadow-xs dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
                >
                  <row.Icon size={14} aria-hidden className="shrink-0 text-rose-500" />
                  <span className="text-xs font-medium" title={row.texto}>
                    {row.texto}
                  </span>
                </li>
              );
            }
            if (row.type === "text") {
              const parts = (row.texto || "").split(/(\{\{[^{}]+\}\})/g);
              return (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg border border-dashed border-sky-300 bg-[#f0f9ff] p-3 shadow-xs dark:border-sky-800 dark:bg-sky-950/30"
                >
                  <span className="mt-0.5 shrink-0 font-serif text-sm leading-none font-bold text-sky-600 select-none dark:text-sky-400">
                    T
                  </span>
                  <div
                    className="min-w-0 flex-1 text-xs leading-relaxed break-words whitespace-pre-wrap text-neutral-800 dark:text-neutral-200"
                    title={row.texto}
                  >
                    {parts.map((part, idx) => {
                      if (part.startsWith("{{") && part.endsWith("}}")) {
                        return (
                          <span
                            key={idx}
                            className="mx-0.5 inline-block rounded bg-[#10b981] px-1.5 py-0.5 align-middle font-sans text-[9px] leading-tight font-bold tracking-wide text-white not-italic shadow-2xs"
                          >
                            {part}
                          </span>
                        );
                      }
                      return <span key={idx}>{part}</span>;
                    })}
                  </div>
                </li>
              );
            }
            if (row.type === "audio") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-purple-300 bg-[#faf5ff] px-3 py-2 text-purple-800 shadow-xs dark:border-purple-800 dark:bg-purple-950/30 dark:text-purple-200"
                >
                  <row.Icon size={14} aria-hidden className="shrink-0 text-purple-600" />
                  <span className="text-xs font-medium" title={row.texto}>
                    {row.texto === "Áudio (nota de voz)"
                      ? "Enviando áudio gravado"
                      : row.texto || "Enviando áudio gravado"}
                  </span>
                </li>
              );
            }
            if (row.type === "image") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-[#fffbeb] px-3 py-2 text-amber-800 shadow-xs dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  <row.Icon size={14} aria-hidden className="shrink-0 text-amber-600" />
                  <span className="text-xs font-medium" title={row.texto}>
                    {row.texto || "Enviando imagem"}
                  </span>
                </li>
              );
            }
            if (row.type === "video") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-emerald-300 bg-[#ecfdf5] px-3 py-2 text-emerald-800 shadow-xs dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                >
                  <row.Icon size={14} aria-hidden className="shrink-0 text-emerald-600" />
                  <span className="text-xs font-medium" title={row.texto}>
                    {row.texto || "Enviando vídeo"}
                  </span>
                </li>
              );
            }
            if (row.type === "document") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-blue-300 bg-[#eff6ff] px-3 py-2 text-blue-800 shadow-xs dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                >
                  <row.Icon size={14} aria-hidden className="shrink-0 text-blue-600" />
                  <span className="text-xs font-medium" title={row.texto}>
                    {row.texto || "Enviando documento"}
                  </span>
                </li>
              );
            }
            return (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-elevated px-2.5 py-1.5 text-text"
              >
                <row.Icon size={13} aria-hidden className="mt-0.5 shrink-0 text-text-muted" />
                <span className="line-clamp-2 text-xs leading-relaxed" title={row.texto}>
                  {row.texto}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Ramos para nós de saída múltipla */}
      {branchRows !== null && (
        <ul
          className="flex flex-col gap-1.5 border-t border-border/70 p-3 pt-2.5"
          data-testid={`node-branches-${id}`}
        >
          {branchRows.map((branch) => {
            const rotulo = t(rotuloDoRamo(branch, nomes));
            const semEtapa = regraSemEtapa(branch, nomes);
            return (
              <li
                key={branch.id}
                className={cn(
                  "relative flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5",
                  branch.kind === "fallback"
                    ? "border-border/60 bg-surface-elevated text-text-muted"
                    : "border-border/60 bg-surface-elevated text-text",
                  semEtapa && "border-warning/50 bg-warning-bg text-warning-fg",
                )}
                data-testid={`node-branch-${id}-${branch.id}`}
                data-regra-sem-etapa={semEtapa || undefined}
                title={
                  semEtapa
                    ? `${rotulo} — ${t("Esta regra não aponta para uma etapa ativa do funil. Abra o nó e escolha a etapa na lista.")}`
                    : rotulo
                }
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {semEtapa ? (
                    <Warning size={12} aria-hidden className="shrink-0" />
                  ) : (
                    <span
                      aria-hidden
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        branch.kind === "fallback" ? "bg-text-muted/50" : visual.handleClassName,
                      )}
                    />
                  )}
                  <span
                    className={cn(
                      "line-clamp-3 text-xs leading-tight font-medium break-words",
                      branch.kind === "fallback" && "italic",
                    )}
                  >
                    {rotulo}
                  </span>
                </div>
                <Handle
                  type="source"
                  id={branch.id}
                  position={Position.Right}
                  className={cn(
                    "!-right-2.5 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !shadow-sm !transition-all hover:!scale-125",
                    visual.handleClassName,
                  )}
                  style={{ top: "50%" }}
                >
                  <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
                </Handle>
              </li>
            );
          })}
        </ul>
      )}

      {/* Saída (Source) única no lado DIREITO com seta estilizada */}
      {showSource && branchRows === null && (
        <Handle
          type="source"
          position={Position.Right}
          className={cn(
            "!-right-2.5 z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !shadow-sm !transition-all hover:!scale-125",
            visual.handleClassName,
          )}
          style={handleTopStyle}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
        </Handle>
      )}
    </div>
  );
}
