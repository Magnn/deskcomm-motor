"use client";

import { useState } from "react";

import { notifyAgentConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

const MENSAGEM_PADRAO = `_*Enviando dados do contato:*_
*Nome:* {{nome}}
*Telefone:* {{telefone}}
*Fluxo:* {{fluxo}}`;

export function NotifyAgentForm({
  config,
  onChange,
}: {
  config: ConfigOf<"notify_agent">;
  onChange: (c: ConfigOf<"notify_agent">) => void;
}) {
  const t = useT();
  const [message, setMessage] = useState(config.message || MENSAGEM_PADRAO);
  const [error, setError] = useState<string | null>(null);

  const commit = (value: string) => {
    setMessage(value);
    const parsed = notifyAgentConfigSchema.safeParse({ message: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {t(
          "Cria um aviso imediato na Central de Notificações da equipe, alertando os atendentes sobre a chegada ou status do contato sem interromper o fluxo."
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Modelo do Aviso")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="notify-agent-message" className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Conteúdo do alerta")}
        </label>
        <textarea
          id="notify-agent-message"
          rows={6}
          maxLength={500}
          value={message}
          onChange={(e) => commit(e.target.value)}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[12px] font-mono text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
        />
        <p className="text-[11px] text-slate-400">
          {t("Suporta formatação do WhatsApp (*negrito*, _itálico_) e variáveis dinâmicas.")}
        </p>
      </div>

      <div className="space-y-1.5 pt-1">
        <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Destinatário da Notificação")}
        </label>
        <select
          defaultValue="all"
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[12px] text-slate-700 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-xs"
        >
          <option value="all">{t("Todos os atendentes disponíveis")}</option>
          <option value="queue">{t("Fila de Atendimento Geral")}</option>
          <option value="responsible">{t("Responsável atribuído ao lead")}</option>
        </select>
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
