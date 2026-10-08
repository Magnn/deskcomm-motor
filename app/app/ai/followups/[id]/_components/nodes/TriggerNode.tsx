"use client";

import { useState } from "react";
import { Handle, Position, NodeToolbar, type NodeProps } from "@xyflow/react";
import { Hash, SquarePen } from "lucide-react";

import { eventoWhatsappDoInicio } from "@/lib/followup/gatilho-do-inicio";
import type { RFNode } from "@/lib/followup/graph-mappers";
import type { TriggerNodeConfig } from "@/lib/followup/graph-schema";
import { ORIGENS_DO_INICIO_ROTULO } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import { copyToClipboard } from "@/lib/clipboard";
import { WhatsappLogo, Play, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

export function TriggerNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const [copiedId, setCopiedId] = useState(false);

  const handleCopyId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(await copyToClipboard(id))) return;
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };
  // O CARTÃO MOSTRA O QUE A CAIXA TEM, e nada além. Antes ele lia origem, evento e
  // palavra-chave do localStorage do navegador (o que o diálogo de "novo fluxo"
  // tinha guardado ali), exibia "quero iniciar meu atendimento" quando não havia
  // palavra nenhuma e um selo "1" que não contava coisa alguma. Quem abria o
  // fluxo em outro computador via outro cartão; e o cartão nunca refletia o que
  // o motor de fato faz. A fonte agora é a config do nó — a mesma que
  // `lib/followup/gatilho-do-inicio.ts` lê para decidir quem entra no fluxo.
  const cfg = (data.config ?? {}) as TriggerNodeConfig;
  const origem = cfg.integration ?? "whatsapp";
  const evento = eventoWhatsappDoInicio(cfg);
  const palavra = (cfg.keyword ?? "").trim();

  const titulo = origem === "whatsapp" ? t("Mensagem recebida") : t(ORIGENS_DO_INICIO_ROTULO[origem]);
  const descricao =
    evento === "keyword"
      ? t("Ao receber uma palavra-chave")
      : evento === "message_received"
        ? t("Ao receber qualquer mensagem")
        : evento === "inicio_conversa"
          ? t("No primeiro contato")
          : t("Esta origem ainda não dispara o fluxo");
  const resumo =
    evento === "keyword"
      ? palavra || t("Palavra-chave em branco")
      : evento === "message_received"
        ? t("Qualquer mensagem")
        : evento === "inicio_conversa"
          ? t("Primeira mensagem do contato")
          : t("Use a origem WhatsApp");
  // Só a palavra-chave em branco e a origem sem motor pedem atenção: são os dois
  // casos em que a publicação recusa.
  const pedeAtencao = evento === null || (evento === "keyword" && palavra === "");

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
          className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-zinc-800 hover:text-white cursor-pointer"
          title={t("Copiar ID do nó")}
        >
          {copiedId ? (
            <Check size={14} className="text-emerald-400" />
          ) : (
            <Hash className="h-3.5 w-3.5 text-text-subtle" />
          )}
        </button>
      </NodeToolbar>

      <div
        className={cn(
          "group relative flex w-[185px] flex-col items-center gap-1.5 rounded-xl border-[1.5px] border-emerald-500 bg-surface p-2.5 font-sans shadow-sm transition-all select-none",
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
        <div className="flex w-full items-center gap-2">
          <div className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-[#10b981] shadow-xs">
            {origem === "whatsapp" ? (
              <WhatsappLogo size={16} weight="bold" className="text-white" />
            ) : (
              <Play size={12} weight="fill" className="text-white" />
            )}
          </div>
          <div
            className="min-w-0 flex-1 truncate text-left text-xs font-bold tracking-tight text-text"
            data-testid="inicio-titulo"
          >
            {titulo}
          </div>
        </div>

        {/* Descrição do gatilho */}
        <div
          className="w-full text-center text-[10px] font-medium text-text-muted"
          data-testid="inicio-descricao"
        >
          {descricao}
        </div>

        {/* Ícone de seta para baixo */}
        <div className="flex h-4 w-4 items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400">
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 1v6M1 4l4 4 4-4" />
          </svg>
        </div>

        {/* Badge verde inferior (palavra-chave / evento) */}
        <div
          className={cn(
            "w-full truncate rounded-lg border px-2 py-1 text-center text-[10.5px] font-semibold",
            pedeAtencao
              ? "border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-emerald-500 bg-emerald-50/60 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
          )}
          data-testid="inicio-resumo"
          title={resumo}
        >
          {resumo}
        </div>

        {/* Handle de saída no lado direito com flecha Play estilizada */}
        <Handle
          type="source"
          position={Position.Right}
          className="z-10 !flex !h-5 !w-5 !items-center !justify-center !rounded-full !border-2 !border-white !bg-[#2563eb] text-white !shadow-sm !transition-all hover:!scale-125"
          style={{ top: "68px" }}
        >
          <Play size={8} weight="fill" className="pointer-events-none ml-0.5 text-white" />
        </Handle>
      </div>
    </>
  );
}
