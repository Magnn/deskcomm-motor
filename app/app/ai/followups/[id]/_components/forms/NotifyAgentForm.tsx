"use client";

import { useState } from "react";
import { ChevronDown, Eye } from "lucide-react";

import { notifyAgentConfigSchema } from "@/lib/followup/graph-schema";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { ConfigOf } from "./shared";

const MENSAGEM_PADRAO = `_*Enviando dados do contato:*_
*Nome:* {{primeiro-nome}}
*Telefone:* {{telefone}}
*Fluxo:* {{fluxo}}`;

const CAMPOS_RAPIDOS = [
  { tag: "{{primeiro-nome}}", label: "Primeiro nome" },
  { tag: "{{nome}}", label: "Nome completo" },
  { tag: "{{telefone}}", label: "Número do WhatsApp" },
  { tag: "{{fluxo}}", label: "Nome do fluxo atual" },
  { tag: "{{email}}", label: "E-mail do contato" },
  { tag: "{{empresa}}", label: "Empresa / Organização" },
];

export function NotifyAgentForm({
  config,
  onChange,
}: {
  config: ConfigOf<"notify_agent">;
  onChange: (c: ConfigOf<"notify_agent">) => void;
}) {
  const t = useT();
  const { data: agentes = [] } = useAgentsList();

  const [modo, setModo] = useState<"manual" | "automatico">(
    config.modo ?? "manual"
  );
  const [atendenteId, setAtendenteId] = useState<string>(
    config.atendente_id ?? ""
  );
  const [notificarAtendenteChat, setNotificarAtendenteChat] = useState<boolean>(
    config.notificar_atendente_chat ?? true
  );
  const [notificarSeguidores, setNotificarSeguidores] = useState<boolean>(
    config.notificar_seguidores ?? false
  );
  const [message, setMessage] = useState(config.message || MENSAGEM_PADRAO);
  const [error, setError] = useState<string | null>(null);

  const commit = (patch: {
    message?: string;
    modo?: "manual" | "automatico";
    atendente_id?: string;
    notificar_atendente_chat?: boolean;
    notificar_seguidores?: boolean;
  }) => {
    const payload = {
      message: patch.message ?? message,
      modo: patch.modo ?? modo,
      atendente_id: patch.atendente_id ?? atendenteId,
      notificar_atendente_chat:
        patch.notificar_atendente_chat ?? notificarAtendenteChat,
      notificar_seguidores: patch.notificar_seguidores ?? notificarSeguidores,
    };

    const parsed = notifyAgentConfigSchema.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleModoChange = (novoModo: "manual" | "automatico") => {
    setModo(novoModo);
    commit({ modo: novoModo });
  };

  const handleAtendenteChange = (id: string) => {
    setAtendenteId(id);
    commit({ atendente_id: id });
  };

  const handleToggleAtendenteChat = (valor: boolean) => {
    setNotificarAtendenteChat(valor);
    commit({ notificar_atendente_chat: valor });
  };

  const handleToggleSeguidores = (valor: boolean) => {
    setNotificarSeguidores(valor);
    commit({ notificar_seguidores: valor });
  };

  const handleMessageChange = (valor: string) => {
    setMessage(valor);
    commit({ message: valor });
  };

  const insertTag = (tag: string) => {
    const next = message ? `${message}\n${tag}` : tag;
    setMessage(next);
    commit({ message: next });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Texto de Ajuda AcassIA */}
      <div className="space-y-2 text-[11.5px] text-slate-500 dark:text-zinc-400 leading-relaxed text-justify">
        <p>
          {t(
            "Esse bloco envia uma mensagem interna de aviso para atendentes do workspace, sem enviar nada ao contato. No modo Manual você escolhe quais atendentes receberão o aviso; no modo Automático a notificação vai para quem já está ligado ao atendimento (atendente responsável do chat e/ou seguidores do contato)."
          )}
        </p>
        <p>
          <strong className="font-semibold text-slate-700 dark:text-zinc-300">
            {t("Dica importante:")}
          </strong>{" "}
          {t(
            "use campos personalizados na mensagem para o atendente receber o contexto já pronto (nome, telefone, fluxo). O fluxo não pausa neste bloco, seguindo imediatamente para a próxima etapa."
          )}
        </p>
      </div>

      {/* Divisor Configurar */}
      <div className="relative flex items-center justify-center my-3">
        <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
        <span className="absolute bg-white dark:bg-zinc-950 px-3 text-[11px] text-slate-400 dark:text-zinc-500 font-medium">
          {t("Configurar")}
        </span>
      </div>

      {/* Abas Pill: Manual / Automático */}
      <div className="flex rounded-full border border-purple-200 dark:border-purple-900/60 p-0.5 bg-slate-50/50 dark:bg-zinc-900/50">
        <button
          type="button"
          onClick={() => handleModoChange("manual")}
          className={cn(
            "flex-1 py-1.5 text-center text-[12px] font-semibold rounded-full transition-all cursor-pointer",
            modo === "manual"
              ? "bg-[#9333ea] text-white shadow-xs"
              : "text-slate-700 dark:text-zinc-300 hover:text-purple-600"
          )}
        >
          {t("Manual")}
        </button>
        <button
          type="button"
          onClick={() => handleModoChange("automatico")}
          className={cn(
            "flex-1 py-1.5 text-center text-[12px] font-semibold rounded-full transition-all cursor-pointer",
            modo === "automatico"
              ? "bg-[#9333ea] text-white shadow-xs"
              : "text-slate-700 dark:text-zinc-300 hover:text-purple-600"
          )}
        >
          {t("Automático")}
        </button>
      </div>

      {/* Configuração do Modo Selecionado */}
      {modo === "manual" ? (
        <div className="space-y-1.5">
          <div className="relative">
            <select
              value={atendenteId}
              onChange={(e) => handleAtendenteChange(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 pr-8 text-xs text-slate-700 dark:text-zinc-200 focus:outline-hidden appearance-none cursor-pointer"
            >
              <option value="">{t("Selecione um atendente")}</option>
              {(agentes ?? []).map((agente: { id: string; name: string }) => (
                <option key={agente.id} value={agente.id}>
                  {agente.name}
                </option>
              ))}
            </select>
            <ChevronDown
              size={15}
              className="absolute right-3 top-3 text-slate-400 pointer-events-none"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/40 dark:bg-purple-950/20 p-3 space-y-2.5">
          <p className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Notificar o(s) usuário(s) responsável(is) pelo atendimento")}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 shadow-2xs">
              <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-200">
                {t("Atendente do chat")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={notificarAtendenteChat}
                onClick={() =>
                  handleToggleAtendenteChat(!notificarAtendenteChat)
                }
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden",
                  notificarAtendenteChat
                    ? "bg-[#9333ea]"
                    : "bg-slate-300 dark:bg-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5",
                    notificarAtendenteChat
                      ? "translate-x-4 ml-0.5"
                      : "translate-x-0.5"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 shadow-2xs">
              <span className="text-[12px] font-medium text-slate-700 dark:text-zinc-200">
                {t("Seguidores do contato")}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={notificarSeguidores}
                onClick={() => handleToggleSeguidores(!notificarSeguidores)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden",
                  notificarSeguidores
                    ? "bg-[#9333ea]"
                    : "bg-slate-300 dark:bg-zinc-700"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5",
                    notificarSeguidores
                      ? "translate-x-4 ml-0.5"
                      : "translate-x-0.5"
                  )}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seção Mensagem a ser enviada */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between">
          <label
            htmlFor="notify-agent-message"
            className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200"
          >
            {t("Mensagem a ser enviada")}
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Eye size={13} className="text-blue-600 dark:text-blue-400" />
                <span>{t("Campos Personalizados")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-56 p-2 space-y-1 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-md rounded-xl"
            >
              <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t("Inserir variável")}
              </p>
              {CAMPOS_RAPIDOS.map((campo) => (
                <button
                  key={campo.tag}
                  type="button"
                  onClick={() => insertTag(campo.tag)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 font-mono text-[11px] text-slate-700 dark:text-zinc-200 flex items-center justify-between cursor-pointer"
                >
                  <span>{campo.tag}</span>
                  <span className="text-[10px] font-sans text-slate-400">
                    {campo.label}
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <textarea
          id="notify-agent-message"
          rows={6}
          maxLength={500}
          value={message}
          onChange={(e) => handleMessageChange(e.target.value)}
          className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[12px] font-mono text-slate-700 dark:text-zinc-100 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 shadow-2xs resize-none"
        />
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
