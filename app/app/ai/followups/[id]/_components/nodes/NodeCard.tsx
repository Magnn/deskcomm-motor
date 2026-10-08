"use client";

import { useState, type ComponentType } from "react";

import { Handle, Position, NodeToolbar, useEdges } from "@xyflow/react";
import { Hash, SquarePen, Trash2 } from "lucide-react";

import type { FlowBranch } from "@/lib/followup/graph-schema";
import { rotuloDoRamo } from "@/lib/followup/rotulo-do-ramo";
import type { NomesDeValor } from "@/lib/followup/vocabulario";
import { ArrowRight, Warning, WarningOctagon, Play, Copy, PencilSimple, Smiley, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";
import { copyToClipboard } from "@/lib/clipboard";
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
  /** Prévia rica personalizada idêntica ao AcassIA */
  customPreview?: React.ReactNode;
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
  wait: "bg-[#475569]",
  condition: "bg-[#dc2626]",
  ai_classify: "bg-[#7e22ce]",
  match_reply: "bg-[#dc2626]",
  menu: "bg-[#0f766e]",
  repeat: "bg-[#0d9488]",
  collect: "bg-[#ea580c]",
  ab_split: "bg-[#db2777]",
  ai_generic: "bg-[#16a34a]",
  api_call: "bg-[#9333ea]",
  notify_agent: "bg-[#2563eb]",
  add_note: "bg-[#ca8a04]",
  attendant_route: "bg-[#0d9488]",
  agent: "bg-[#8b5cf6]",
  pix_payment: "bg-[#059669]",
  payment_gateway: "bg-[#7c3aed]",
  whatsapp_template: "bg-[#2563eb]",
  meta_pixel: "bg-[#d97706]",
  voice_studio: "bg-[#8b5cf6]",
  google_sheets: "bg-[#15803d]",
  execute_code: "bg-[#d97706]",
  end: "bg-[#52525b]",
};

const BORDER_COLOR_BY_TYPE: Record<string, string> = {
  action: "!border-purple-600 text-purple-600",
  trigger: "!border-emerald-600 text-emerald-600",
  wait: "!border-slate-600 text-text-muted",
  condition: "!border-red-600 text-red-600",
  ai_classify: "!border-purple-700 text-purple-700",
  match_reply: "!border-red-600 text-red-600",
  menu: "!border-teal-700 text-teal-700",
  repeat: "!border-teal-600 text-teal-600",
  collect: "!border-orange-500 text-orange-500",
  ab_split: "!border-pink-600 text-pink-600",
  ai_generic: "!border-green-600 text-green-600",
  api_call: "!border-purple-600 text-purple-600",
  notify_agent: "!border-blue-600 text-blue-600",
  add_note: "!border-amber-600 text-amber-600",
  attendant_route: "!border-yellow-600 text-yellow-600",
  pix_payment: "!border-emerald-600 text-emerald-600",
  payment_gateway: "!border-purple-600 text-purple-600",
  whatsapp_template: "!border-blue-600 text-blue-600",
  meta_pixel: "!border-amber-600 text-amber-600",
  voice_studio: "!border-purple-600 text-purple-600",
  google_sheets: "!border-emerald-600 text-emerald-600",
  execute_code: "!border-amber-600 text-amber-600",
  end: "!border-zinc-500 text-text-muted",
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
  customPreview,
}: Props) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  // Quais saídas deste nó têm aresta. Saída SEM ligação não é erro: o lead que sair por ela fica parado
  // neste nó (o funil só avança até onde foi montado) — a tela só precisa mostrar isso ao dono.
  const arestas = useEdges();
  const saidasLigadas = new Set(arestas.filter((e) => e.source === id).map((e) => e.sourceHandle ?? null));
  const Icon = visual.icon;
  const hasError = (errors?.length ?? 0) > 0;
  const branchRows = branches !== undefined && branches.length > 1 ? branches : null;
  const headerBg = HEADER_BG_BY_TYPE[visual.type] ?? "bg-[#7c3aed]";
  const targetBorderClass = BORDER_COLOR_BY_TYPE[visual.type] ?? "!border-purple-600 text-purple-600";
  const handleTopStyle = { top: "68px" };

  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await copyToClipboard(id))) return;
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <>
      {/* Barra de Ferramentas Flutuante (ChatbotX / AcassIA Parity) */}
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        offset={12}
        className="flex items-center gap-1 rounded-xl border border-zinc-700/80 bg-zinc-900/95 p-1 text-zinc-100 shadow-2xl backdrop-blur-md z-50 animate-in fade-in zoom-in-95 duration-150 select-none"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("flow-select-node", { detail: { id } }));
          }}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
          title={t("Editar configurações")}
        >
          <SquarePen className="h-3.5 w-3.5 text-indigo-400" />
          {t("Editar")}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            window.dispatchEvent(new CustomEvent("flow-duplicate-node", { detail: { id } }));
          }}
          className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
          title={t("Duplicar nó")}
        >
          <Copy size={14} className="text-text-subtle" />
        </button>

        <button
          type="button"
          onClick={handleCopyId}
          className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
          title={t("Copiar ID do nó")}
        >
          {copiedId ? (
            <Check size={14} className="text-emerald-400" />
          ) : (
            <Hash className="h-3.5 w-3.5 text-text-subtle" />
          )}
        </button>

        {visual.type !== "trigger" && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("flow-delete-node", { detail: { id } }));
            }}
            className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
            title={t("Excluir nó")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </NodeToolbar>

      <div
        className={cn(
          "group relative min-w-[280px] max-w-[320px] w-[280px] overflow-visible rounded-[10px] border-[1.5px] font-sans shadow-sm transition-all duration-300 select-none bg-surface",
          selected
            ? "border-purple-600 ring-1 ring-purple-600 shadow-md"
            : "border-slate-500 hover:border-slate-600 hover:shadow-md",
          simulating && !hasError && "animate-pulse ring-2 ring-emerald-500 ring-offset-1",
          hasError && "border-red-500 ring-2 ring-red-500 ring-offset-1",
        )}
        data-testid={`node-card-${id}`}
        data-simulating={simulating || undefined}
        title={hasError ? errors!.join("; ") : undefined}
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("flow-select-node", { detail: { id } }));
        }}
      >
        {hasError && (
          <span
            aria-hidden
            className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white shadow-md"
          >
            <WarningOctagon size={12} weight="fill" aria-hidden />
          </span>
        )}

      {/* Entrada (Target) no lado ESQUERDO com círculo branco, borda colorida e seta ▶ */}
      {showTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className={cn(
            "z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !bg-surface !shadow-sm !transition-all hover:!scale-125",
            targetBorderClass,
          )}
          style={handleTopStyle}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5" />
        </Handle>
      )}



      {/* Cabeçalho sólido com botões de Duplicar e Editar (AcassIA parity) */}
      <div
        className={cn(
          "flex items-stretch justify-between rounded-t-[8px] overflow-hidden",
          headerBg,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 overflow-hidden">
          <div className="flex items-center justify-center shrink-0">
            <Icon size={16} className="text-white" aria-hidden />
          </div>
          <span
            className="text-[13px] font-bold tracking-tight truncate capitalize text-white"
            title={label}
          >
            {label}
          </span>
        </div>
        <div className="flex items-stretch bg-black/10 shrink-0">
          <button
            type="button"
            className="flex items-center justify-center w-[36px] hover:bg-black/20 transition-colors cursor-pointer border-r border-black/10 text-white"
            title={t("Duplicar nó")}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("flow-duplicate-node", { detail: { id } }));
            }}
          >
            <Copy size={15} className="text-white" aria-hidden />
          </button>
          <button
            type="button"
            className="flex items-center justify-center w-[36px] hover:bg-black/20 transition-colors cursor-pointer text-white"
            title={t("Editar nó")}
            onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent("flow-select-node", { detail: { id } }));
            }}
          >
            <SquarePen className="h-3.5 w-3.5 text-white" aria-hidden />
          </button>
        </div>
      </div>

      {/* Subtítulo ou visual customizado ou placeholder de configuração */}
      {customPreview ? (
        <div className="p-3">{customPreview}</div>
      ) : !previewRows || previewRows.length === 0 ? (
        visual.type === "action" ? (
          <div className="p-3 flex flex-col items-center justify-center gap-2 py-6 min-h-[110px]">
            <Smiley size={40} className="text-text-muted" weight="regular" aria-hidden />
            <span className="text-[13px] font-medium text-text-muted">{t("Aguardando Configuração...")}</span>
          </div>
        ) : (
          <div className="p-3">
            <p
              className="line-clamp-2 rounded-lg border border-border/60 bg-surface-elevated px-2.5 py-1.5 text-xs leading-relaxed break-words text-text-muted"
              title={subtitle}
            >
              {subtitle}
            </p>
          </div>
        )
      ) : null}

      {hasError && (
        <p
          className="border-t border-error/30 px-3 py-1.5 text-xs leading-snug text-error-fg"
          data-testid={`node-error-${id}`}
        >
          {errors![0]}
        </p>
      )}

      {/* Itens de conteúdo (Cards especializados: Delay, Texto, Áudio, etc. — padrão AcassIA) */}
      {previewRows !== undefined && previewRows.length > 0 && (
        <ul className="flex flex-col gap-2 p-3" data-testid={`node-preview-${id}`}>
          {previewRows.map((row, i) => {
            if (row.type === "delay") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#f472b6]/60 bg-[#fdf2f8] dark:bg-pink-950/20 px-2.5 py-2 text-[11px] font-medium text-text-muted leading-[1.4]"
                >
                  <row.Icon size={15} aria-hidden className="shrink-0 text-[#f43f5e]" />
                  <span title={row.texto}>{row.texto}</span>
                </li>
              );
            }
            if (row.type === "text") {
              const parts = (row.texto || "").split(/(\{\{[^{}]+\}\})/g);
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-[8px] border border-dashed border-[#60a5fa]/60 bg-[#eff6ff] dark:bg-blue-950/20 px-2.5 py-2 text-[11px] font-normal text-text-muted leading-relaxed"
                >
                  <span className="shrink-0 font-serif text-sm font-bold leading-none select-none text-[#2563eb] mt-0.5">
                    T
                  </span>
                  <div
                    className="flex-1 min-w-0 break-words whitespace-pre-wrap italic line-clamp-[14]"
                    title={row.texto}
                  >
                    {parts.map((part, idx) => {
                      if (part.startsWith("{{") && part.endsWith("}}")) {
                        return (
                          <span
                            key={idx}
                            className="inline-block bg-[#10b981] text-white px-1.5 py-0.5 rounded-md font-bold text-[9px] not-italic tracking-wide align-middle leading-tight mt-[1px]"
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
                  className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#c084fc]/60 bg-[#faf5ff] dark:bg-purple-950/20 px-2.5 py-2 text-[11px] font-medium text-text-muted leading-[1.4]"
                >
                  <row.Icon size={15} aria-hidden className="shrink-0 text-[#9333ea]" />
                  <span title={row.texto}>
                    {row.texto === "Áudio (nota de voz)"
                      ? t("Enviando áudio gravado")
                      : row.texto || t("Enviando áudio gravado")}
                  </span>
                </li>
              );
            }
            if (row.type === "image") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#fb923c]/60 bg-[#fff7ed] dark:bg-orange-950/20 px-2.5 py-2 text-[11px] font-medium text-text-muted leading-[1.4]"
                >
                  <row.Icon size={15} aria-hidden className="shrink-0 text-[#ea580c]" />
                  <span title={row.texto}>{row.texto || "Enviando uma imagem"}</span>
                </li>
              );
            }
            if (row.type === "video") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#4ade80]/60 bg-[#f0fdf4] dark:bg-green-950/20 px-2.5 py-2 text-[11px] font-medium text-text-muted leading-[1.4]"
                >
                  <row.Icon size={15} aria-hidden className="shrink-0 text-[#16a34a]" />
                  <span title={row.texto}>{row.texto || t("Enviando um vídeo")}</span>
                </li>
              );
            }
            if (row.type === "document") {
              return (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-[8px] border border-dashed border-[#60a5fa]/60 bg-[#eff6ff] dark:bg-blue-950/20 px-2.5 py-2 text-[11px] font-medium text-text-muted leading-[1.4]"
                >
                  <row.Icon size={15} aria-hidden className="shrink-0 text-[#2563eb]" />
                  <span title={row.texto}>{row.texto || "Enviando um documento"}</span>
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
                {visual.type === "ab_split" && branch.kind !== "fallback" ? (
                  (() => {
                    const match = rotulo.match(/^(.*?)\s*\((\d+(?:\.\d+)?%?)\)$/);
                    if (match && match[1] && match[2]) {
                      const pct = match[2];
                      return (
                        <div className="flex w-full min-w-0 items-center justify-between pr-2">
                          <span className="text-xs font-semibold text-text">{match[1]}</span>
                          <span className="text-[11px] font-medium text-text-muted">{pct.endsWith("%") ? pct : pct + "%"}</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="line-clamp-3 text-xs leading-tight font-medium break-words">{rotulo}</span>
                      </div>
                    );
                  })()
                ) : (
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
                )}
                {!saidasLigadas.has(branch.id) && (
                  <span
                    className="shrink-0 rounded-full border border-dashed border-border px-1.5 text-[9px] font-medium text-text-muted"
                    title={t("Esta saída não está ligada a nada: o lead que sair por aqui fica parado neste passo.")}
                    data-testid={`saida-solta-${id}-${branch.id}`}
                  >
                    {t("sem ligação")}
                  </span>
                )}
                <Handle
                  type="source"
                  id={branch.id}
                  position={Position.Right}
                  className={cn(
                    "!-right-[13.5px] !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !shadow-sm !transition-all hover:!scale-125",
                    branch.id === "timeout" || branch.id === "sem_resposta"
                      ? "!bg-[#ef4444] text-white"
                      : "!bg-[#2563eb] text-white",
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

      {showSource && branchRows === null && saidasLigadas.size === 0 && (
        <p
          className="border-t border-dashed border-border/70 px-3 py-1 text-[10px] leading-snug text-text-muted"
          data-testid={`saida-solta-${id}`}
        >
          {t("Sem ligação: o lead fica parado neste passo.")}
        </p>
      )}

      {/* Saída (Source) única no lado DIREITO com seta estilizada */}
      {showSource && branchRows === null && (
        <Handle
          type="source"
          position={Position.Right}
          className="z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#2563eb] text-white !shadow-sm !transition-all hover:!scale-125"
          style={handleTopStyle}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
        </Handle>
      )}
    </div>
    </>
  );
}
