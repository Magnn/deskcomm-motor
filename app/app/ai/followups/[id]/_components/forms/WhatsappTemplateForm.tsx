"use client";

import { useState } from "react";
import { ChatCircle, FileText } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { whatsappTemplateConfigSchema } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"whatsapp_template">;
  onChange: (c: ConfigOf<"whatsapp_template">) => void;
}

const TEMPLATE_OPTIONS = [
  { id: "saudacao_inicial", name: "saudacao_inicial (Aprovado)" },
  { id: "retomada_carrinho", name: "retomada_carrinho (Aprovado)" },
  { id: "confirmacao_pedido", name: "confirmacao_pedido (Aprovado)" },
  { id: "oferta_exclusiva", name: "oferta_exclusiva (Aprovado)" },
  { id: "lembrete_reuniao", name: "lembrete_reuniao (Aprovado)" },
];

export function WhatsappTemplateForm({ config, onChange }: Props) {
  const t = useT();
  const [templateName, setTemplateName] = useState(config.template_name || "");
  const [timeout, setTimeoutVal] = useState(config.timeout ?? 60);
  const [timeoutUnit, setTimeoutUnit] = useState<"Minutos" | "Horas" | "Dias">(
    config.timeout_unit || "Minutos"
  );

  const update = (patch: Partial<ConfigOf<"whatsapp_template">>) => {
    const next = {
      template_name: patch.template_name ?? templateName,
      timeout: patch.timeout ?? timeout,
      timeout_unit: patch.timeout_unit ?? timeoutUnit,
    };
    const parsed = whatsappTemplateConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card no estilo AcassIA */}
      <div className="flex items-center gap-2.5 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2563eb] text-white shadow-2xs">
          <ChatCircle size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Editar")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Template WhatsApp Oficial")}
          </p>
        </div>
      </div>

      {/* Subheader verde com ícone de documento */}
      <div className="flex items-center gap-2 pt-1 font-semibold text-neutral-800 dark:text-neutral-200">
        <FileText size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
        <span className="text-sm">{t("Template WhatsApp (Meta)")}</span>
      </div>

      {/* Template aprovado */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Template aprovado")}
        </label>
        <select
          value={templateName}
          onChange={(e) => {
            setTemplateName(e.target.value);
            update({ template_name: e.target.value });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="">{t("Selecione um template")}</option>
          {TEMPLATE_OPTIONS.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
            </option>
          ))}
          {templateName && !TEMPLATE_OPTIONS.some((o) => o.id === templateName) && (
            <option value={templateName}>{templateName}</option>
          )}
        </select>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Selecione o modelo aprovado na sua conta da Meta (WhatsApp Cloud API).")}
        </p>
      </div>

      {/* Timeout de resposta + Unidade */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Timeout de resposta")}
          </label>
          <input
            type="number"
            min={1}
            max={10080}
            value={timeout}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10) || 1;
              setTimeoutVal(val);
              update({ timeout: val });
            }}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Unidade")}
          </label>
          <select
            value={timeoutUnit}
            onChange={(e) => {
              const unit = e.target.value as "Minutos" | "Horas" | "Dias";
              setTimeoutUnit(unit);
              update({ timeout_unit: unit });
            }}
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-blue-600 focus:ring-1 focus:ring-blue-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="Minutos">{t("Minutos")}</option>
            <option value="Horas">{t("Horas")}</option>
            <option value="Dias">{t("Dias")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
