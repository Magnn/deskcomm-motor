"use client";

import { useState } from "react";
import { CreditCard, UploadSimple, Info } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { pixPaymentConfigSchema, type PixKeyType } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"pix_payment">;
  onChange: (c: ConfigOf<"pix_payment">) => void;
}

const PIX_TYPES: Array<{ value: PixKeyType; label: string }> = [
  { value: "aleatoria", label: "Chave Aleatória" },
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
];

export function PixPaymentForm({ config, onChange }: Props) {
  const t = useT();
  const [keyType, setKeyType] = useState<PixKeyType>(config.key_type || "aleatoria");
  const [pixKey, setPixKey] = useState(config.pix_key || "");
  const [beneficiary, setBeneficiary] = useState(config.beneficiary || "");
  const [amount, setAmount] = useState(config.amount || "");
  const [messageText, setMessageText] = useState(config.message_text || "");
  const [cardImageUrl, setCardImageUrl] = useState(config.card_image_url || "");

  const update = (patch: Partial<ConfigOf<"pix_payment">>) => {
    const next = {
      key_type: patch.key_type ?? keyType,
      pix_key: patch.pix_key ?? pixKey,
      beneficiary: patch.beneficiary ?? beneficiary,
      amount: patch.amount ?? amount,
      message_text: patch.message_text ?? messageText,
      card_image_url: patch.card_image_url ?? cardImageUrl,
    };
    const parsed = pixPaymentConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card no estilo AcassIA */}
      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#059669] text-white shadow-2xs">
          <CreditCard size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Editar PIX")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Cobrança instantânea via chave ou botão PIX")}
          </p>
        </div>
      </div>

      {/* Tipo da Chave PIX */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Tipo da Chave PIX")} *
        </label>
        <select
          value={keyType}
          onChange={(e) => {
            const val = e.target.value as PixKeyType;
            setKeyType(val);
            update({ key_type: val });
          }}
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {PIX_TYPES.map((pt) => (
            <option key={pt.value} value={pt.value}>
              {pt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Chave PIX */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Chave PIX")} *
          </label>
          <span className="text-[11px] text-neutral-400 font-mono">&lt;&gt;</span>
        </div>
        <input
          type="text"
          value={pixKey}
          onChange={(e) => {
            setPixKey(e.target.value);
            update({ pix_key: e.target.value });
          }}
          placeholder="123e4567-e89b-12d3-a456-426614174000"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <p className="text-[11px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t("Na integração oficial, o código do pedido (EMV) usa esta mesma chave. Como no chat ao vivo.")}
        </p>
      </div>

      {/* Destinatário do pagamento */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Destinatário do pagamento")}
          </label>
          <span className="text-[11px] text-neutral-400 font-mono">&lt;&gt;</span>
        </div>
        <input
          type="text"
          value={beneficiary}
          onChange={(e) => {
            setBeneficiary(e.target.value);
            update({ beneficiary: e.target.value });
          }}
          placeholder="Ex: Leona Solutions"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Se não preenchido, será usado \"Pix\" nas conexões padrão.")}
        </p>
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {t("Obrigatório na integração oficial (WhatsApp Cloud API / Meta).")}
        </p>
      </div>

      {/* Valor (R$) */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
            {t("Valor (R$)")}
          </label>
          <span className="text-[11px] text-neutral-400 font-mono">&lt;&gt;</span>
        </div>
        <input
          type="text"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            update({ amount: e.target.value });
          }}
          placeholder="Ex: 49,90"
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {t("Obrigatório quando o fluxo roda na integração oficial (WhatsApp Cloud API / Meta).")}
        </p>
      </div>

      {/* Texto da mensagem (opcional) */}
      <div className="space-y-1">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Texto da mensagem (opcional)")}
        </label>
        <div className="relative">
          <textarea
            rows={3}
            maxLength={1024}
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              update({ message_text: e.target.value });
            }}
            placeholder={t("Ex.: Pode fazer o PIX no valor de R$ {valor} conforme combinamos 👇")}
            className="w-full rounded-lg border border-neutral-300 bg-white p-2.5 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 resize-none"
          />
          <div className="flex items-center justify-between pt-0.5 text-[10px] text-neutral-400">
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {t("Integração oficial (Meta): texto livre no card Pix. Conexões padrão ignoram este campo.")}
            </span>
            <span>{messageText.length}/1024</span>
          </div>
        </div>
      </div>

      {/* Imagem do card (URL ou variável) */}
      <div className="space-y-2">
        <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
          {t("Imagem do card (URL ou variável)")}
        </label>
        <div className="relative">
          <input
            type="text"
            value={cardImageUrl}
            onChange={(e) => {
              setCardImageUrl(e.target.value);
              update({ card_image_url: e.target.value });
            }}
            placeholder="https://cdn.exemplo.com/banner.jpg ou {product_image}"
            className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 shadow-2xs outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
          {t("Integração oficial (Meta): imagem no topo do card. Conexões padrão ignoram.")}
        </p>

        <div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            <UploadSimple size={14} />
            <span>{t("Enviar imagem")}</span>
          </button>
        </div>

        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Use variáveis como {full_name} ou campos customizados. Valores são resolvidos na execução do fluxo.")}
        </p>
      </div>

      {/* Card Como funciona */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
        <div className="flex items-center gap-1.5 font-semibold text-neutral-800 dark:text-neutral-200">
          <Info size={14} className="text-neutral-500 dark:text-neutral-400" />
          <span>{t("Como funciona")}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          {t(
            "Este nó envia um botão PIX para o cliente, permitindo que ele copie a chave PIX e realize o pagamento diretamente no aplicativo do banco. O mesmo bloco pode ser usado em conexões padrão e na integração oficial."
          )}
        </p>
        <p className="text-[11px] font-medium leading-relaxed text-amber-700 dark:text-amber-400">
          {t(
            "Nas conexões padrão, basta chave e tipo. Na integração oficial (Meta), valor (R$) e nome do recebedor são obrigatórios na execução. Preencha abaixo para o envio funcionar."
          )}
        </p>
      </div>
    </div>
  );
}
