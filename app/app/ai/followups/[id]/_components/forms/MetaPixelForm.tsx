"use client";

import { useState } from "react";
import { Target, CaretDown } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { metaPixelConfigSchema } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"meta_pixel">;
  onChange: (c: ConfigOf<"meta_pixel">) => void;
}

const PIXEL_EVENTS = [
  { id: "Compra", label: "Compra" },
  { id: "Lead", label: "Lead" },
  { id: "InitiateCheckout", label: "Iniciar Finalização de Compra (InitiateCheckout)" },
  { id: "AddToCart", label: "Adicionar ao Carrinho (AddToCart)" },
  { id: "ViewContent", label: "Visualizar Conteúdo (ViewContent)" },
  { id: "Contact", label: "Contato (Contact)" },
  { id: "CustomizeProduct", label: "Personalizar Produto (CustomizeProduct)" },
];

const CURRENCY_INFO: Record<string, string> = {
  BRL: "OK · BRL · Real brasileiro",
  USD: "OK · USD · Dólar americano",
  EUR: "OK · EUR · Euro",
  ARS: "OK · ARS · Peso argentino",
  MXN: "OK · MXN · Peso mexicano",
};

export function MetaPixelForm({ config, onChange }: Props) {
  const t = useT();
  const [pixelId, setPixelId] = useState(config.pixel_id || "");
  const [eventType, setEventType] = useState(config.event_type || "Compra");
  const [pageId, setPageId] = useState(config.page_id || "");
  const [itemValue, setItemValue] = useState(config.item_value || "");
  const [currency, setCurrency] = useState(config.currency || "BRL");

  const update = (patch: Partial<ConfigOf<"meta_pixel">>) => {
    const next = {
      pixel_id: patch.pixel_id ?? pixelId,
      event_type: patch.event_type ?? eventType,
      page_id: patch.page_id ?? pageId,
      item_value: patch.item_value ?? itemValue,
      currency: patch.currency ?? currency,
    };
    const parsed = metaPixelConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const currencyFeedback =
    CURRENCY_INFO[currency.toUpperCase()] || `OK · ${currency.toUpperCase()}`;

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card no estilo AcassIA */}
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d97706] text-white shadow-2xs">
          <Target size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Editar Pixel")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Disparo de eventos no Meta Pixel / CAPI")}
          </p>
        </div>
      </div>

      {/* Pixel Configurado */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-text-muted">
          {t("Pixel Configurado")} *
        </label>
        <select
          value={pixelId}
          onChange={(e) => {
            setPixelId(e.target.value);
            update({ pixel_id: e.target.value });
          }}
          className="w-full rounded-lg border-2 border-amber-400/80 bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-600/80"
        >
          <option value="">{t("Selecione um pixel configurado")}</option>
          <option value="pixel_principal">Pixel Principal (Meta Ads)</option>
          <option value="pixel_conversoes">{t("Pixel Conversões WhatsApp")}</option>
          {pixelId && pixelId !== "pixel_principal" && pixelId !== "pixel_conversoes" && (
            <option value={pixelId}>{pixelId}</option>
          )}
        </select>
        <p className="text-[11px] text-text-muted">
          {t("Configure seus pixels em Configurações → Pixels do Facebook")}
        </p>
      </div>

      {/* Tipo do evento */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-text-muted">
          {t("Tipo do evento")} *
        </label>
        <select
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            update({ event_type: e.target.value });
          }}
          className="w-full rounded-lg border-2 border-amber-400/80 bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-600/80"
        >
          {PIXEL_EVENTS.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.label}
            </option>
          ))}
        </select>
      </div>

      {/* Page ID (Obrigatório para WhatsApp) */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-text-muted">
          {t("Page ID (Obrigatório para WhatsApp)")} *
        </label>
        <div className="relative">
          <textarea
            rows={3}
            value={pageId}
            onChange={(e) => {
              setPageId(e.target.value);
              update({ page_id: e.target.value });
            }}
            placeholder="Ex: 123456789012345 ou {pagina_id}"
            className="w-full rounded-lg border border-border-strong bg-surface p-2.5 text-xs text-text shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none font-mono"
          />
          <div className="flex items-center gap-1 p-1 text-[11px] text-text-subtle">
            <span className="font-mono">&lt;&gt;</span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t(
            "ID da página do Facebook vinculada ao WhatsApp Business. Obrigatório para eventos via WhatsApp. Use o botão de variáveis na barra de ferramentas para inserir campos dinâmicos."
          )}
        </p>
      </div>

      {/* Valor do item */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-text-muted">
          {t("Valor do item")} *
        </label>
        <div className="relative rounded-lg border border-border-strong bg-surface p-2.5 shadow-2xs focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500">
          <textarea
            rows={4}
            value={itemValue}
            onChange={(e) => {
              setItemValue(e.target.value);
              update({ item_value: e.target.value });
            }}
            placeholder="Ex: 197,00 ou {preco}"
            className="w-full bg-transparent text-xs text-text outline-hidden resize-none placeholder:text-text-subtle"
          />
          <div className="flex items-center pt-1 text-text-subtle font-mono text-[11px]">
            <span
              onClick={() => {
                setItemValue((prev) => (prev ? `${prev} {preco}` : "{preco}"));
                update({ item_value: itemValue ? `${itemValue} {preco}` : "{preco}" });
              }}
              className="cursor-pointer hover:text-amber-600 transition-colors"
              title={t("Inserir variável")}
            >
              &lt;&gt;
            </span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t(
            "Usado apenas para eventos de compra. Use o botão de variáveis na barra de ferramentas para inserir campos dinâmicos."
          )}
        </p>
      </div>

      {/* Moeda */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-text-muted">
            {t("Moeda")}
          </label>
          <button
            type="button"
            onClick={() => {
              setCurrency("{moeda}");
              update({ currency: "{moeda}" });
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 transition-colors cursor-pointer"
          >
            <span>&lt;&gt;</span>
            <span>{t("Variáveis")}</span>
          </button>
        </div>

        <div className="flex items-center rounded-lg border-2 border-emerald-500/80 bg-surface px-2.5 py-1.5 shadow-2xs dark:border-emerald-600/80">
          <div className="flex items-center gap-1 pr-2 text-text-subtle border-r border-border mr-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-strong text-[10px] font-bold text-text-muted">
              $
            </span>
            <CaretDown size={12} />
          </div>
          <input
            type="text"
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              update({ currency: e.target.value });
            }}
            placeholder="BRL"
            className="w-full bg-transparent text-xs font-medium text-text outline-hidden"
          />
        </div>
        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
          {currencyFeedback}
        </p>
      </div>

      {/* Card Como funciona */}
      <div className="space-y-1.5 rounded-xl border border-border bg-surface-elevated p-3.5">
        <div className="flex items-center gap-1.5 font-semibold text-text">
          <span className="text-text-subtle text-xs font-bold">$</span>
          <span>{t("Como funciona")}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-text-muted">
          {t(
            "Este nó dispara eventos no Facebook através da Conversions API. Selecione um pixel configurado nas Configurações para usar."
          )}
        </p>
      </div>
    </div>
  );
}
