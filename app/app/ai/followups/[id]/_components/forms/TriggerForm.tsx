"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";

export function TriggerForm({
  config = {},
  onChange,
}: {
  config?: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [integration, setIntegration] = useState<string>(
    typeof config.integration === "string" ? config.integration : "whatsapp"
  );
  const [event, setEvent] = useState<string>(
    typeof config.event === "string" ? config.event : "keyword"
  );
  const [keyword, setKeyword] = useState<string>(
    typeof config.keyword === "string" ? config.keyword : ""
  );

  const isWhatsApp = integration === "whatsapp";

  const handleIntegrationChange = (val: string) => {
    setIntegration(val);
    const nextEvent = val === "whatsapp" ? "keyword" : "purchase";
    setEvent(nextEvent);
    onChange({
      ...config,
      integration: val,
      event: nextEvent,
    });
  };

  const handleEventChange = (val: string) => {
    setEvent(val);
    onChange({
      ...config,
      integration,
      event: val,
    });
  };

  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    onChange({
      ...config,
      integration,
      event,
      keyword: val,
    });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      <div className="space-y-1 text-slate-500 dark:text-zinc-400 leading-relaxed text-[11px]">
        <p>
          {t(
            "O nó de gatilho determina a porta de entrada dos contatos no funil. Escolha a integração e o evento disparador."
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Configurar Gatilho")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Integração")}
        </label>
        <select
          value={integration}
          onChange={(e) => handleIntegrationChange(e.target.value)}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
        >
          <option value="whatsapp">WhatsApp (Oficial / Não Oficial)</option>
          <option value="hotmart">Hotmart</option>
          <option value="kiwify">Kiwify</option>
          <option value="asaas">Asaas</option>
          <option value="stripe">Stripe</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Evento")}
        </label>
        <select
          value={event}
          onChange={(e) => handleEventChange(e.target.value)}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
        >
          {isWhatsApp ? (
            <>
              <option value="keyword">{t("Palavra-chave")}</option>
              <option value="message_received">{t("Mensagem recebida")}</option>
              <option value="inicio_conversa">{t("Início de conversa")}</option>
            </>
          ) : (
            <>
              <option value="purchase">{t("Compra aprovada")}</option>
              <option value="abandon">{t("Carrinho abandonado")}</option>
            </>
          )}
        </select>
      </div>

      {isWhatsApp && event === "keyword" && (
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-baseline justify-between">
            <label className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
              {t("Palavra-chave")}
            </label>
            <span className="text-[10px] text-slate-400">
              {t("ativa o gatilho ao receber")}
            </span>
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            placeholder='Ex.: "QUERO_PROPOSTA" ou "COMPRAR"'
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          />
        </div>
      )}

      <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl space-y-1">
        <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">
          💡 {t("Dica de Automação")}
        </p>
        <p className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 leading-relaxed">
          {t(
            "Você pode vincular este funil a múltiplos disparos e canais em Ajustes do Fluxo."
          )}
        </p>
      </div>
    </div>
  );
}
