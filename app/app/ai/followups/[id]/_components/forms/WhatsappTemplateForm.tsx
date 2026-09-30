"use client";

import { useState } from "react";
import { ChatCircle, FileText, Clock, CheckCircle, WhatsappLogo } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { whatsappTemplateConfigSchema } from "@/lib/followup/graph-schema";
import { cn } from "@/lib/utils";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"whatsapp_template">;
  onChange: (c: ConfigOf<"whatsapp_template">) => void;
}

const TEMPLATE_OPTIONS = [
  {
    id: "saudacao_inicial",
    name: "saudacao_inicial (Aprovado)",
    preview: "Olá {{1}}, tudo bem? Vimos que você se interessou pelo nosso produto. Como podemos te ajudar hoje?",
    category: "MARKETING",
  },
  {
    id: "retomada_carrinho",
    name: "retomada_carrinho (Aprovado)",
    preview: "Oi {{1}}! Seu pedido ainda está reservado por tempo limitado. Clique no botão abaixo para concluir com frete grátis!",
    category: "MARKETING",
  },
  {
    id: "confirmacao_pedido",
    name: "confirmacao_pedido (Aprovado)",
    preview: "Olá {{1}}, seu pedido #{{2}} foi confirmado com sucesso e já está sendo preparado!",
    category: "UTILITY",
  },
  {
    id: "oferta_exclusiva",
    name: "oferta_exclusiva (Aprovado)",
    preview: "Aproveite 20% de desconto exclusivo para você usando o cupom {{1}} nas próximas 24 horas!",
    category: "MARKETING",
  },
  {
    id: "lembrete_reuniao",
    name: "lembrete_reuniao (Aprovado)",
    preview: "Olá {{1}}! Lembrando que nossa conversa está agendada para hoje às {{2}}. Esperamos você!",
    category: "UTILITY",
  },
];

const PRESETS_TIMEOUT = [
  { label: "15 min", val: 15, unit: "Minutos" as const },
  { label: "1h", val: 1, unit: "Horas" as const },
  { label: "2h", val: 2, unit: "Horas" as const },
  { label: "24h", val: 24, unit: "Horas" as const },
  { label: "3 dias", val: 3, unit: "Dias" as const },
];

export function WhatsappTemplateForm({ config, onChange }: Props) {
  const t = useT();
  const [templateName, setTemplateName] = useState(config.template_name || "");
  const [timeout, setTimeoutVal] = useState(config.timeout ?? 60);
  const [timeoutUnit, setTimeoutUnit] = useState<"Minutos" | "Horas" | "Dias">(
    config.timeout_unit || "Minutos"
  );

  const selectedTemplate = TEMPLATE_OPTIONS.find((t) => t.id === templateName);

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
      {/* Header do Card Branded WhatsApp */}
      <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200 shadow-2xs">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#059669] to-[#10b981] text-white shadow-md">
          <WhatsappLogo size={22} weight="fill" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {t("WhatsApp Template (HSM)")}
            </h3>
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
              {t("Oficial Meta")}
            </span>
          </div>
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Dispare mensagens aprovadas pela Meta mesmo fora da janela de 24h.")}
          </p>
        </div>
      </div>

      {/* Seletor de Template Aprovado */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            <FileText size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{t("Template Aprovado na Meta")}</span>
          </label>
          {templateName && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle size={12} weight="fill" />
              <span>{t("Aprovado")}</span>
            </span>
          )}
        </div>

        <select
          value={templateName}
          onChange={(e) => {
            setTemplateName(e.target.value);
            update({ template_name: e.target.value });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 cursor-pointer"
        >
          <option value="">{t("Selecione um template cadastrado...")}</option>
          {TEMPLATE_OPTIONS.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>
              {tmpl.name}
            </option>
          ))}
          {templateName && !TEMPLATE_OPTIONS.some((o) => o.id === templateName) && (
            <option value={templateName}>{templateName}</option>
          )}
        </select>

        {/* Pré-visualização do Balão de WhatsApp */}
        {selectedTemplate ? (
          <div className="mt-2.5 rounded-xl border border-emerald-200 bg-[#e5ddd5]/30 dark:bg-neutral-950/60 p-3 shadow-inner">
            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>{t("Pré-visualização do Balão")}</span>
              <span className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1 py-0.2">
                {selectedTemplate.category}
              </span>
            </div>
            <div className="relative max-w-[280px] rounded-2xl rounded-tl-sm bg-[#dcf8c6] dark:bg-[#005c4b] p-3 text-neutral-900 dark:text-neutral-100 shadow-xs text-[11.5px] leading-relaxed">
              <p>{selectedTemplate.preview}</p>
              <div className="mt-1 flex justify-end text-[9px] text-neutral-500 dark:text-neutral-400">
                12:00 ✓✓
              </div>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Selecione o modelo aprovado na sua conta da Meta (WhatsApp Cloud API).")}
          </p>
        )}
      </div>

      {/* Timeout de resposta + Unidade */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 shadow-2xs">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            <Clock size={15} className="text-neutral-500" />
            <span>{t("Timeout de Espera pela Resposta")}</span>
          </label>
          <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
            {timeout} {t(timeoutUnit)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-[10.5px] font-medium text-neutral-500">
              {t("Valor")}
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
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[10.5px] font-medium text-neutral-500">
              {t("Unidade")}
            </label>
            <select
              value={timeoutUnit}
              onChange={(e) => {
                const unit = e.target.value as "Minutos" | "Horas" | "Dias";
                setTimeoutUnit(unit);
                update({ timeout_unit: unit });
              }}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 cursor-pointer"
            >
              <option value="Minutos">{t("Minutos")}</option>
              <option value="Horas">{t("Horas")}</option>
              <option value="Dias">{t("Dias")}</option>
            </select>
          </div>
        </div>

        {/* Presets de timeout */}
        <div className="flex items-center gap-1.5 pt-1">
          <span className="text-[10px] font-bold uppercase text-neutral-400">
            {t("Presets:")}
          </span>
          {PRESETS_TIMEOUT.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setTimeoutVal(p.val);
                setTimeoutUnit(p.unit);
                update({ timeout: p.val, timeout_unit: p.unit });
              }}
              className={cn(
                "rounded-md px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer",
                timeout === p.val && timeoutUnit === p.unit
                  ? "bg-emerald-600 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
