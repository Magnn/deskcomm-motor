"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { WhatsappLogo, Play } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function TriggerNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const cfg = (data.config || {}) as Record<string, unknown>;
  const triggerKind = String(cfg.kind || "keyword");

  const triggerDescription =
    triggerKind === "inbound_after_silence"
      ? t("Retorno após silêncio")
      : triggerKind === "manual"
        ? t("Disparo manual")
        : triggerKind === "deal_stage_changed"
          ? t("Mudança de etapa")
          : triggerKind === "contact_created"
            ? t("Contato criado")
            : t("Mensagem recebida");

  const keyword =
    typeof cfg.keyword === "string" && cfg.keyword
      ? cfg.keyword
      : typeof cfg.label === "string" && cfg.label
        ? cfg.label
        : t("Qualquer mensagem");

  return (
    <div
      className="group relative flex w-[176px] flex-col items-center gap-0 font-sans transition-all select-none"
      data-testid={`trigger-node-${id}`}
    >
      {/* Trigger Main Card */}
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden rounded-[10px] border bg-white shadow-sm transition-all dark:bg-neutral-900",
          selected
            ? "border-emerald-500 shadow-md ring-2 ring-emerald-500/30"
            : "border-slate-300 hover:border-emerald-400 dark:border-neutral-700",
          data.simulating && "animate-pulse ring-2 ring-emerald-500",
        )}
      >
        <div className="grid min-h-[39px] grid-cols-[42px_1fr] items-center">
          <div className="flex h-full items-center justify-center border-r border-slate-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#10b981] shadow-xs">
              <WhatsappLogo size={16} weight="bold" className="text-white" />
            </div>
          </div>
          <div className="truncate px-2 text-center text-[12px] font-semibold tracking-tight text-slate-900 dark:text-neutral-100">
            {data.label || "WhatsApp"}
          </div>
        </div>
        <div className="flex min-h-[26px] items-center justify-center border-t border-slate-100 bg-slate-50 px-1.5 py-1 text-center text-[9.5px] leading-tight font-medium text-slate-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
          {triggerDescription}
        </div>
      </div>

      {/* Seta vertical para baixo */}
      <div className="-mt-px mb-0.5 flex flex-col items-center justify-center text-emerald-500">
        <div className="relative z-10 -mt-px block h-px w-[10px] bg-white dark:bg-neutral-900" />
        <div className="flex h-[16px] w-3.5 flex-col items-center justify-center bg-emerald-500 shadow-2xs">
          <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor">
            <path d="M4 6L0 0H8L4 6Z" />
          </svg>
        </div>
      </div>

      {/* Bloco de Palavra-chave / Evento */}
      <div className="flex min-h-[44px] w-full max-w-[162px] items-center justify-center rounded-lg border-[1.3px] border-emerald-500 bg-white px-2.5 py-1.5 text-center text-[9.5px] leading-tight font-semibold break-words text-slate-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100">
        {keyword}
      </div>

      {/* Handle de saída no lado direito com flecha Play */}
      <Handle
        type="source"
        position={Position.Right}
        className="!-right-2.5 z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#2563eb] text-white !shadow-sm !transition-all hover:!scale-125"
        style={{ top: "20px" }}
      >
        <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
      </Handle>
    </div>
  );
}
