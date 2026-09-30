"use client";

import { useState } from "react";
import { Target } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { metaPixelConfigSchema } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"meta_pixel">;
  onChange: (c: ConfigOf<"meta_pixel">) => void;
}

const PIXEL_EVENTS = [
  { id: "Compra", label: "Compra (Purchase)" },
  { id: "Lead", label: "Lead" },
  { id: "InitiateCheckout", label: "Iniciar Finalização de Compra (InitiateCheckout)" },
  { id: "AddToCart", label: "Adicionar ao Carrinho (AddToCart)" },
  { id: "ViewContent", label: "Visualizar Conteúdo (ViewContent)" },
  { id: "Contact", label: "Contato (Contact)" },
  { id: "CustomizeProduct", label: "Personalizar Produto (CustomizeProduct)" },
];

export function MetaPixelForm({ config, onChange }: Props) {
  const t = useT();
  const [pixelId, setPixelId] = useState(config.pixel_id || "");
  const [eventType, setEventType] = useState(config.event_type || "Compra");
  const [pageId, setPageId] = useState(config.page_id || "");
  const [itemValue, setItemValue] = useState(config.item_value || "");

  const update = (patch: Partial<ConfigOf<"meta_pixel">>) => {
    const next = {
      pixel_id: patch.pixel_id ?? pixelId,
      event_type: patch.event_type ?? eventType,
      page_id: patch.page_id ?? pageId,
      item_value: patch.item_value ?? itemValue,
    };
    const parsed = metaPixelConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card no estilo AcassIA */}
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#d97706] text-white shadow-2xs">
          <Target size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Editar Pixel")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Disparo de eventos no Meta Pixel / CAPI")}
          </p>
        </div>
      </div>

      {/* Pixel Configurado */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Pixel Configurado")} *
        </label>
        <select
          value={pixelId}
          onChange={(e) => {
            setPixelId(e.target.value);
            update({ pixel_id: e.target.value });
          }}
          className="w-full rounded-lg border-2 border-amber-400/80 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-600/80 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">{t("Selecione um pixel configurado")}</option>
          <option value="pixel_principal">Pixel Principal (Meta Ads)</option>
          <option value="pixel_conversoes">Pixel Conversões WhatsApp</option>
          {pixelId && pixelId !== "pixel_principal" && pixelId !== "pixel_conversoes" && (
            <option value={pixelId}>{pixelId}</option>
          )}
        </select>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Configure seus pixels em Configurações → Pixels do Facebook")}
        </p>
      </div>

      {/* Tipo do evento */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Tipo do evento")} *
        </label>
        <select
          value={eventType}
          onChange={(e) => {
            setEventType(e.target.value);
            update({ event_type: e.target.value });
          }}
          className="w-full rounded-lg border-2 border-amber-400/80 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-amber-600/80 dark:bg-neutral-800 dark:text-neutral-100"
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
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
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
            className="w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 resize-none font-mono"
          />
          <div className="flex items-center gap-1 p-1 text-[11px] text-neutral-400">
            <span className="font-mono">&lt;&gt;</span>
          </div>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t(
            "ID da página do Facebook vinculada ao WhatsApp Business. Obrigatório para eventos via WhatsApp. Use o botão de variáveis na barra de ferramentas para inserir campos dinâmicos."
          )}
        </p>
      </div>

      {/* Valor do item */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Valor do item")} *
        </label>
        <input
          type="text"
          value={itemValue}
          onChange={(e) => {
            setItemValue(e.target.value);
            update({ item_value: e.target.value });
          }}
          placeholder="Ex: 197,00 ou {preco}"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
      </div>
    </div>
  );
}
