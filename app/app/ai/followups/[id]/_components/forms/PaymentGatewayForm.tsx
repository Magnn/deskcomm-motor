"use client";

import { useState } from "react";
import { CreditCard, Copy, Check } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import { copyToClipboard } from "@/lib/clipboard";
import { paymentGatewayConfigSchema } from "@/lib/followup/graph-schema";
import type { ConfigOf } from "./shared";

interface Props {
  config: ConfigOf<"payment_gateway">;
  onChange: (c: ConfigOf<"payment_gateway">) => void;
}

const CURRENCIES = [
  { code: "BRL", label: "BR BRL", symbol: "R$" },
  { code: "USD", label: "US USD", symbol: "$" },
  { code: "EUR", label: "EU EUR", symbol: "€" },
  { code: "ARS", label: "AR ARS", symbol: "$" },
  { code: "MXN", label: "MX MXN", symbol: "$" },
];

const VARIAVEIS_COBRANCA = [
  { key: "{gateway.transaction_id}", desc: "ID da transação" },
  { key: "{gateway.payment_code}", desc: "PIX copia e cola (BRL), CLABE (MXN) ou CVU/CBU (ARS)" },
  { key: "{gateway.bank_name}", desc: "Banco do destinatário (ARS/MXN)" },
  { key: "{gateway.beneficiary}", desc: "Nome do destinatário (ARS/MXN)" },
  { key: "{gateway.value}", desc: "Valor pago" },
  { key: "{gateway.erro}", desc: "Código de erro" },
];

export function PaymentGatewayForm({ config, onChange }: Props) {
  const t = useT();
  const [currency, setCurrency] = useState(config.currency || "BRL");
  const [amount, setAmount] = useState(config.amount || "100,00");
  const [openAmount, setOpenAmount] = useState(Boolean(config.open_amount));
  const [customerName, setCustomerName] = useState(config.customer_name || "{full_name}");
  const [customerPhone, setCustomerPhone] = useState(config.customer_phone || "{phone_number}");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const update = (patch: Partial<ConfigOf<"payment_gateway">>) => {
    const next = {
      currency: patch.currency ?? currency,
      amount: patch.amount ?? amount,
      open_amount: patch.open_amount ?? openAmount,
      customer_name: patch.customer_name ?? customerName,
      customer_phone: patch.customer_phone ?? customerPhone,
    };
    const parsed = paymentGatewayConfigSchema.safeParse(next);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };

  const handleCopyVar = async (key: string) => {
    if (!(await copyToClipboard(key))) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header do Card no estilo AcassIA */}
      <div className="flex items-center gap-2.5 rounded-lg border border-cat-violet/30 bg-cat-violet-bg p-3 text-cat-violet-fg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#7c3aed] text-white shadow-2xs">
          <CreditCard size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Editar Pagamento")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Configuração do gateway de pagamento")}
          </p>
        </div>
      </div>

      {/* Moeda e Valor */}
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-wide text-text-muted uppercase">
          {t("Moeda e Valor")}
        </label>
        <div className="flex items-center gap-2">
          <select
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value);
              update({ currency: e.target.value });
            }}
            className="w-[120px] shrink-0 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs font-medium text-text shadow-2xs outline-hidden focus:border-cat-violet focus:ring-1 focus:ring-cat-violet"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            disabled={openAmount}
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              update({ amount: e.target.value });
            }}
            placeholder="100,00"
            className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-cat-violet focus:ring-1 focus:ring-cat-violet disabled:bg-surface-elevated disabled:text-text-subtle"
          />
        </div>
      </div>

      {/* Chave sem valor (Toggle Switch) */}
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface-elevated p-3">
        <div className="space-y-0.5 pr-3">
          <div className="text-xs font-semibold text-text">
            {t("Chave sem valor")}
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">
            {t("Lead paga o valor que quiser. Depois do pagamento, use {gateway.value}.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={openAmount}
          onClick={() => {
            const next = !openAmount;
            setOpenAmount(next);
            update({ open_amount: next });
          }}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-hidden ${
            openAmount ? "bg-[#7c3aed]" : "bg-border-strong"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-surface shadow-md ring-0 transition duration-200 ease-in-out ${
              openAmount ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {/* Nome */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            {t("Nome")}
          </label>
          <button
            type="button"
            onClick={() => {
              setCustomerName("{full_name}");
              update({ customer_name: "{full_name}" });
            }}
            className="flex items-center gap-1 text-[11px] text-text-muted transition-colors hover:text-cat-violet"
          >
            <span>&lt;&gt;</span>
            <span>{t("Inserir variável")}</span>
          </button>
        </div>
        <input
          type="text"
          value={customerName}
          onChange={(e) => {
            setCustomerName(e.target.value);
            update({ customer_name: e.target.value });
          }}
          placeholder="{full_name}"
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-cat-violet focus:ring-1 focus:ring-cat-violet"
        />
      </div>

      {/* Telefone */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-semibold tracking-wide text-text-muted uppercase">
            {t("Telefone")}
          </label>
          <button
            type="button"
            onClick={() => {
              setCustomerPhone("{phone_number}");
              update({ customer_phone: "{phone_number}" });
            }}
            className="flex items-center gap-1 text-[11px] text-text-muted transition-colors hover:text-cat-violet"
          >
            <span>&lt;&gt;</span>
            <span>{t("Inserir variável")}</span>
          </button>
        </div>
        <input
          type="text"
          value={customerPhone}
          onChange={(e) => {
            setCustomerPhone(e.target.value);
            update({ customer_phone: e.target.value });
          }}
          placeholder="{phone_number}"
          className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-xs text-text shadow-2xs outline-hidden focus:border-cat-violet focus:ring-1 focus:ring-cat-violet"
        />
      </div>

      {/* Variáveis após a cobrança */}
      <div className="space-y-2 rounded-xl border border-border bg-surface-elevated p-3.5">
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold tracking-wide text-text-muted uppercase">
            {t("Variáveis após a cobrança")}
          </div>
          <p className="text-[11px] leading-relaxed text-text-muted">
            {t("Disponíveis no fluxo após gerar a cobrança. Não vão para os campos do Lead.")}
          </p>
        </div>

        <div className="space-y-1.5 pt-1">
          {VARIAVEIS_COBRANCA.map((v) => (
            <div
              key={v.key}
              onClick={() => handleCopyVar(v.key)}
              title={t("Clique para copiar")}
              className="group flex cursor-pointer items-start justify-between gap-2 rounded-md p-1.5 transition-colors hover:bg-surface"
            >
              <div className="min-w-0 flex-1">
                <span className="font-mono text-xs font-semibold text-[#7c3aed]">
                  {v.key}
                </span>{" "}
                <span className="text-[11px] text-text-muted">{v.desc}</span>
              </div>
              <div className="shrink-0 text-text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                {copiedKey === v.key ? (
                  <Check size={14} className="text-cat-green" />
                ) : (
                  <Copy size={14} />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
