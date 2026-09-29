"use client";

import type { ComponentType } from "react";

import { Handle, Position } from "@xyflow/react";

import type { FlowBranch } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { NomesDeValor } from "@/lib/followup/vocabulario";
import { ArrowRight, Warning, WarningOctagon } from "@/lib/ui/icons";
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
  // Uma saída só continua sendo a bolinha de sempre no rodapé: não há o que
  // rotular, e mexer nisso quebraria o arrasto de todo nó não-ramificado.
  const branchRows = branches !== undefined && branches.length > 1 ? branches : null;

  return (
    <div
      className={cn(
        "group relative w-72 rounded-2xl border bg-surface font-sans shadow-sm transition-all duration-200 select-none",
        selected
          ? cn("ring-2 ring-offset-1 ring-offset-bg shadow-lg", visual.selectedClassName)
          : cn("border-border hover:shadow-md hover:border-border-strong", visual.hoverBorderClassName),
        // Simulação tem prioridade visual sobre seleção (o operador está de olho
        // "onde a conversa está agora"), mas nunca some com o erro de publish —
        // um nó não fica com cara de saudável só porque a simulação passou por ele.
        simulating && !hasError && "ring-2 ring-success ring-offset-1 ring-offset-bg animate-pulse",
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
      {showTarget && (
        <Handle type="target" position={Position.Top} className={cn(HANDLE_BASE, "!bg-surface !border-border-strong")} />
      )}
      <div className="flex items-center gap-2.5 border-b border-border/70 p-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl shadow-sm",
            visual.chipClassName,
          )}
        >
          <Icon size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-text" title={label}>
            {label}
          </p>
          <span
            className={cn(
              "mt-0.5 inline-block rounded-sm px-1 text-[10px] font-medium tracking-wide uppercase",
              visual.badgeClassName,
            )}
          >
            {t(visual.paletteLabel)}
          </span>
        </div>
      </div>
      <div className="p-3">
        <p
          className="line-clamp-2 break-words rounded-lg border border-border/60 bg-surface-elevated px-2.5 py-1.5 text-xs leading-relaxed text-text-muted"
          title={subtitle}
        >
          {subtitle}
        </p>
      </div>
      {hasError && (
        <p
          className="border-t border-error/30 px-3 py-1.5 text-xs leading-snug text-error-fg"
          data-testid={`node-error-${id}`}
        >
          {errors![0]}
        </p>
      )}
      {previewRows !== undefined && previewRows.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-border/70 p-3 pt-2.5" data-testid={`node-preview-${id}`}>
          {previewRows.map((row, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 transition-colors",
                row.type === "delay"
                  ? "border-rose-200/80 bg-rose-50/50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300"
                  : row.type === "text"
                    ? "border-sky-200/80 bg-sky-50/40 text-neutral-800 dark:border-sky-900/40 dark:bg-sky-950/20 dark:text-neutral-100"
                    : "border-border/60 bg-surface-elevated text-text",
              )}
            >
              {row.type === "text" ? (
                <span className="font-serif font-bold text-xs text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">T</span>
              ) : (
                <row.Icon
                  size={13}
                  aria-hidden
                  className={cn(
                    "shrink-0 mt-0.5",
                    row.type === "delay" ? "text-rose-500" : "text-text-muted",
                  )}
                />
              )}
              <span className="line-clamp-2 text-xs leading-relaxed" title={row.texto}>
                {row.texto}
              </span>
            </li>
          ))}
        </ul>
      )}
      {branchRows !== null && (
        <ul className="flex flex-col gap-1.5 border-t border-border/70 p-3 pt-2.5" data-testid={`node-branches-${id}`}>
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
                  {/* Três linhas, não duas: a frase da regra interpola dado do
                      usuário («Etapa · Funil»), e o que estourava era justamente o
                      fim — o nome do funil, que existe para desambiguar. */}
                  <span
                    className={cn(
                      "line-clamp-3 break-words text-xs leading-tight font-medium",
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
                  // Uma bolinha por LINHA: a saída sai ao lado do seu próprio rótulo,
                  // que é o que torna "qual aresta sai de qual regra" visível. No
                  // rodapé elas ficariam lado a lado, sem espaço para nome nenhum.
                  className={cn(HANDLE_BASE, "!-right-[18px]", visual.handleClassName)}
                  style={{ top: "50%" }}
                />
              </li>
            );
          })}
        </ul>
      )}
      {showSource && branchRows === null && (
        <div className="relative flex items-center justify-end rounded-b-2xl border-t border-border/70 bg-surface-elevated/60 px-3 py-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
            {t("Continuar")}
            <ArrowRight size={11} aria-hidden />
          </span>
          {/* Posição (Bottom, centralizada) é a mesma de sempre — só o estilo mudou.
              Mover o handle para acompanhar visualmente o rótulo "Continuar" mexeria
              no ponto onde as arestas já existentes se ancoram. */}
          <Handle type="source" position={Position.Bottom} className={cn(HANDLE_BASE, visual.handleClassName)} />
        </div>
      )}
    </div>
  );
}
