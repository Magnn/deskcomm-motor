"use client";

import { useState } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import { Hash, SquarePen } from "lucide-react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { useT } from "@/hooks/i18n/useT";
import { descreverGatilho } from "@/lib/followup/gatilho-da-criacao";
import { useGatilhoDoFluxo } from "../GatilhoDoFluxo";
import { WhatsappLogo, Play, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function TriggerNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };
  const gatilho = descreverGatilho(useGatilhoDoFluxo());
  const providerId: string = gatilho.providerId === "whatsapp" ? "whatsapp" : gatilho.providerId;
  const eventLabel = gatilho.evento;
  const keywordText = gatilho.palavras.length > 0 ? gatilho.palavras.join(", ") : null;

  let providerName = data.label || "WhatsApp";
  let providerIcon = (
    <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#10b981] shadow-xs">
      <WhatsappLogo size={16} weight="bold" className="text-white" />
    </div>
  );

  if (providerId === "kiwify") {
    providerName = "Kiwify";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-emerald-100 shadow-xs border border-emerald-400">
        <span className="text-[9px] font-black text-emerald-800">kiwi</span>
      </div>
    );
  } else if (providerId === "perfectpay") {
    providerName = "Perfect Pay";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#00897b] shadow-xs text-white font-black text-xs italic">
        P
      </div>
    );
  } else if (providerId === "payt") {
    providerName = "PayT";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#f97316] shadow-xs text-white font-black text-[9px]">
        payt
      </div>
    );
  } else if (providerId === "hotmart") {
    providerName = "Hotmart";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#ea580c] shadow-xs text-white font-black text-[9px]">
        🔥
      </div>
    );
  } else if (providerId === "braip") {
    providerName = "Braip";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#6d28d9] shadow-xs text-white font-black text-[8px]">
        BRAIP
      </div>
    );
  } else if (providerId === "yampi") {
    providerName = "Yampi";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 to-purple-500 shadow-xs text-white font-black text-xs">
        ♥
      </div>
    );
  } else if (providerId === "cakto") {
    providerName = "Cakto";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#365314] shadow-xs text-white font-black text-xs">
        🌵
      </div>
    );
  } else if (providerId === "asaas") {
    providerName = "Asaas";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#002f6c] shadow-xs text-white font-black text-[8px]">
        ASAS
      </div>
    );
  } else if (providerId === "bestfy") {
    providerName = "Bestfy";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#059669] shadow-xs text-white font-serif font-black text-xs">
        b
      </div>
    );
  } else if (providerId === "tray") {
    providerName = "Tray";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-[#0284c7] shadow-xs text-white font-black text-[9px]">
        🛒
      </div>
    );
  } else if (providerId === "webhook") {
    providerName = "Webhook";
    providerIcon = (
      <div className="flex h-[27px] w-[27px] items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 shadow-xs text-amber-300 font-black text-xs">
        ⚡
      </div>
    );
  }

  const triggerDescription = eventLabel ? t(eventLabel) : t("Gatilho não configurado");

  const bottomBadge = keywordText ? `Palavra-chave: "${keywordText}"` : eventLabel ?? t("Qualquer mensagem");
  void bottomBadge;

  const keywordPillText =
    keywordText || (eventLabel ? t(eventLabel) : t("Configure o gatilho"));

  return (
    <>
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
          <SquarePen className="h-3.5 w-3.5 text-emerald-400" />
          {t("Editar")}
        </button>

        <button
          type="button"
          onClick={handleCopyId}
          className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
          title={t("Copiar ID do nó")}
        >
          {copiedId ? (
            <Check size={14} className="text-emerald-400" />
          ) : (
            <Hash className="h-3.5 w-3.5 text-zinc-300" />
          )}
        </button>
      </NodeToolbar>

      <div
        className={cn(
          "group relative flex w-[185px] flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-emerald-500 bg-white p-2.5 font-sans shadow-sm transition-all select-none dark:bg-neutral-900",
          selected
            ? "shadow-md ring-2 ring-emerald-500/30"
            : "hover:border-emerald-600 hover:shadow-md",
          data.simulating && "animate-pulse ring-2 ring-emerald-500",
        )}
        data-testid={`trigger-node-${id}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          window.dispatchEvent(new CustomEvent("flow-select-node", { detail: { id } }));
        }}
      >
        {/* Header com Ícone e Notificação '1' */}
        <div className="flex w-full items-center gap-2">
          <div className="relative flex shrink-0 items-center justify-center">
            {providerIcon}
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8.5px] font-bold text-white shadow-2xs">
              1
            </span>
          </div>
          <div className="min-w-0 flex-1 truncate text-left text-xs font-bold tracking-tight text-slate-800 dark:text-neutral-100">
            {providerName === "WhatsApp" ? t("Mensagem recebida") : providerName}
          </div>
        </div>

        {/* Descrição do gatilho */}
        <div className="w-full text-center text-[10px] font-medium text-slate-500 dark:text-neutral-400">
          {triggerDescription}
        </div>

        {/* Ícone de seta para baixo */}
        <div className="flex h-4 w-4 items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 1v6M1 4l4 4 4-4" />
          </svg>
        </div>

        {/* Badge verde inferior (palavra-chave / evento) */}
        <div className="w-full truncate rounded-lg border border-emerald-500 bg-emerald-50/60 px-2 py-1 text-center text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {keywordPillText}
        </div>

        {/* Handle de saída no lado direito com flecha Play estilizada */}
        <Handle
          type="source"
          position={Position.Right}
          className="!-right-2.5 z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#2563eb] text-white !shadow-sm !transition-all hover:!scale-125"
          style={{ top: "22px" }}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
        </Handle>
      </div>
    </>
  );
}
