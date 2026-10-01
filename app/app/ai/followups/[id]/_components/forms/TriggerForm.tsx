"use client";

import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { ORIGENS_DO_INICIO } from "@/lib/followup/graph-schema";
import { ORIGENS_DO_INICIO_ROTULO } from "@/lib/followup/vocabulario";

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
  const [tag, setTag] = useState<string>(
    typeof config.tag === "string" ? config.tag : ""
  );
  const [customField, setCustomField] = useState<string>(
    typeof config.custom_field === "string" ? config.custom_field : ""
  );
  const [inactivityHours, setInactivityHours] = useState<number>(
    typeof config.inactivity_hours === "number" ? config.inactivity_hours : 24
  );

  const isWhatsApp = integration === "whatsapp";
  const isCrm = integration === "crm";
  const isWebhook = integration === "webhook";

  const handleIntegrationChange = (val: string) => {
    setIntegration(val);
    let nextEvent = "keyword";
    if (val === "crm") nextEvent = "tag_added";
    else if (val === "webhook") nextEvent = "webhook_payload";
    else if (val !== "whatsapp") nextEvent = "purchase";

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

  const updateField = (patch: Record<string, unknown>) => {
    onChange({
      ...config,
      integration,
      event,
      keyword,
      tag,
      custom_field: customField,
      inactivity_hours: inactivityHours,
      ...patch,
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

      {/* Origem / Integração */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Origem do Gatilho")}
        </label>
        <select
          value={integration}
          onChange={(e) => handleIntegrationChange(e.target.value)}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
        >
          {ORIGENS_DO_INICIO.map((origem) => (
            <option key={origem} value={origem}>
              {t(ORIGENS_DO_INICIO_ROTULO[origem])}
            </option>
          ))}
        </select>
      </div>

      {/* Evento */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Evento Disparador")}
        </label>
        <select
          value={event}
          onChange={(e) => handleEventChange(e.target.value)}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
        >
          {isWhatsApp && (
            <>
              <option value="keyword">{t("Palavra-chave recebida")}</option>
              <option value="message_received">{t("Qualquer mensagem recebida")}</option>
              <option value="inicio_conversa">{t("Primeiro contato (Início de conversa)")}</option>
            </>
          )}

          {isCrm && (
            <>
              <option value="tag_added">{t("Tag adicionada ao contato")}</option>
              <option value="tag_removed">{t("Tag removida do contato")}</option>
              <option value="contact_created">{t("Novo contato criado / Lead capturado")}</option>
              <option value="field_changed">{t("Campo personalizado alterado")}</option>
              <option value="contact_inactivity">{t("Inatividade do contato")}</option>
              <option value="deal_stage_changed">{t("Mudança de etapa no funil (Pipeline)")}</option>
            </>
          )}

          {isWebhook && (
            <>
              <option value="webhook_payload">{t("Chamada de Webhook recebida")}</option>
            </>
          )}

          {!isWhatsApp && !isCrm && !isWebhook && (
            <>
              <option value="purchase">{t("Compra aprovada")}</option>
              <option value="abandon">{t("Carrinho abandonado")}</option>
              <option value="pix_generated">{t("PIX ou boleto gerado")}</option>
            </>
          )}
        </select>
      </div>

      {/* Condição adicional conforme o evento */}
      {isWhatsApp && event === "keyword" && (
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <div className="flex items-baseline justify-between">
            <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
              {t("Palavra-chave")}
            </label>
            <span className="text-[10px] text-slate-400">
              {t("ativa o gatilho ao receber")}
            </span>
          </div>
          <input
            type="text"
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value);
              updateField({ keyword: e.target.value });
            }}
            placeholder='Ex.: "QUERO_PROPOSTA" ou "COMPRAR"'
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          />
        </div>
      )}

      {isCrm && (event === "tag_added" || event === "tag_removed") && (
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Nome da Tag")}
          </label>
          <input
            type="text"
            value={tag}
            onChange={(e) => {
              setTag(e.target.value);
              updateField({ tag: e.target.value });
            }}
            placeholder="ex: vip, cliente, lead-frio"
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          />
        </div>
      )}

      {isCrm && event === "field_changed" && (
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Chave do Campo Personalizado")}
          </label>
          <input
            type="text"
            value={customField}
            onChange={(e) => {
              setCustomField(e.target.value);
              updateField({ custom_field: e.target.value });
            }}
            placeholder="ex: status_financeiro, plano"
            className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
          />
        </div>
      )}

      {isCrm && event === "contact_inactivity" && (
        <div className="space-y-1.5 animate-in fade-in duration-200">
          <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
            {t("Tempo de inatividade")}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={720}
              value={inactivityHours}
              onChange={(e) => {
                const val = Number(e.target.value);
                setInactivityHours(val);
                updateField({ inactivity_hours: val });
              }}
              className="w-24 rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-[13px] text-slate-800 dark:text-zinc-100 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs"
            />
            <span className="text-slate-500">{t("horas sem interação")}</span>
          </div>
        </div>
      )}

      {isWhatsApp ? (
        <div
          className="p-3 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 rounded-xl space-y-1"
          data-testid="inicio-como-funciona"
        >
          <p className="text-[11px] text-indigo-700 dark:text-indigo-400 font-medium">{t("Como funciona")}</p>
          <p className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 leading-relaxed">
            {t(
              "Este evento vale para os números vinculados a este fluxo. Vincule o número no botão do gatilho, no topo da tela, em \"Números que este fluxo responde\". A mudança só passa a valer depois de publicar."
            )}
          </p>
        </div>
      ) : (
        <div
          className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl space-y-1"
          data-testid="inicio-origem-em-construcao"
        >
          <p className="text-[11px] text-amber-800 dark:text-amber-400 font-medium">{t("Esta origem ainda não dispara o fluxo")}</p>
          <p className="text-[11px] text-amber-700/90 dark:text-amber-400/80 leading-relaxed">
            {t(
              "Por enquanto só a origem WhatsApp inicia o fluxo por esta caixa. Com outra origem aqui o fluxo não publica. Para iniciar por etapa do funil, lead criado ou webhook, use o botão do gatilho, no topo da tela."
            )}
          </p>
        </div>
      )}
    </div>
  );
}
