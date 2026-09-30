"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateFollowupFlow } from "@/hooks/followup/useFollowupFlows";
import { useT } from "@/hooks/i18n/useT";
import { Check, ShareNetwork, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Provider {
  id: string;
  name: string;
  defaultEvent: string;
  events: Array<{ value: string; label: string }>;
  renderIcon: () => React.ReactNode;
}

const PROVIDERS: Provider[] = [
  {
    id: "whatsapp",
    name: "WhatsApp",
    defaultEvent: "mensagem_recebida",
    events: [
      { value: "mensagem_recebida", label: "Mensagem recebida" },
      { value: "inicio_conversa", label: "Início de conversa" },
      { value: "palavra_chave", label: "Enviou palavra-chave" },
      { value: "qualquer_mensagem", label: "Qualquer mensagem" },
    ],
    renderIcon: () => (
      <div className="relative flex items-center justify-center">
        {/* Balão WhatsApp verde com badge 1 vermelho */}
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <path
            d="M16 3C8.82 3 3 8.82 3 16C3 18.57 3.75 20.97 5.04 23L3.5 28.5L9.2 27C11.16 28.14 13.5 28.8 16 28.8C23.18 28.8 29 22.98 29 15.8C29 8.62 23.18 3 16 3Z"
            stroke="#22c55e"
            strokeWidth="2.2"
            fill="#f0fdf4"
          />
          <path
            d="M16 6.5C10.75 6.5 6.5 10.75 6.5 16C6.5 17.88 7.05 19.64 8 21.13L7 25L10.97 24C12.43 24.87 14.15 25.38 16 25.38C21.25 25.38 25.5 21.13 25.5 15.88C25.5 10.63 21.25 6.5 16 6.5Z"
            fill="#22c55e"
          />
        </svg>
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-xs">
          1
        </span>
      </div>
    ),
  },
  {
    id: "webhook",
    name: "Webhook / Raio",
    defaultEvent: "webhook_recebido",
    events: [
      { value: "webhook_recebido", label: "Webhook disparado" },
      { value: "payload_custom", label: "Evento customizado" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 shadow-xs">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#fbbf24">
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
        </svg>
      </div>
    ),
  },
  {
    id: "kiwify",
    name: "Kiwify",
    defaultEvent: "pagamento_aprovado",
    events: [
      { value: "pagamento_aprovado", label: "Pagamento Aprovado" },
      { value: "pagamento_recusado", label: "Pagamento recusado" },
      { value: "aguardando_pagamento", label: "Aguardando pagamento" },
      { value: "chargeback", label: "Chargeback" },
      { value: "carrinho_abandonado", label: "Carrinho abandonado" },
      { value: "boleto_gerado", label: "Boleto gerado" },
      { value: "pix_gerado", label: "Pix gerado" },
      { value: "reembolso", label: "Reembolso" },
    ],
    renderIcon: () => (
      <div className="flex flex-col items-center justify-center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="#16a34a" strokeWidth="2.5" />
          <circle cx="12" cy="12" r="4.5" fill="#16a34a" />
          <path d="M12 3V6M12 18V21M3 12H6M18 12H21" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <span className="text-[7.5px] font-extrabold tracking-tight text-emerald-700 leading-tight">
          kiwify
        </span>
      </div>
    ),
  },
  {
    id: "perfectpay",
    name: "Perfect Pay",
    defaultEvent: "aguardando_pagamento",
    events: [
      { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
      { value: "aprovado_autorizado", label: "Aprovado/Autorizado" },
      { value: "em_revisao_manual", label: "Em revisão manual" },
      { value: "em_moderacao", label: "Em moderação" },
      { value: "chargeback", label: "Chargeback" },
      { value: "reembolso", label: "Reembolso" },
      { value: "cancelado", label: "Cancelado" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00897b] shadow-xs">
        <span className="font-sans text-sm font-black text-white italic">P</span>
      </div>
    ),
  },
  {
    id: "payt",
    name: "PayT",
    defaultEvent: "pagamento_aprovado",
    events: [
      { value: "pagamento_aprovado", label: "Pagamento Aprovado" },
      { value: "reservado_aguardando", label: "Reservado - Aguardando Pagamento" },
      { value: "faturado", label: "Faturado" },
      { value: "em_separacao", label: "Em separação" },
      { value: "enviado", label: "Enviado" },
      { value: "entregue", label: "Entregue" },
      { value: "cancelado", label: "Cancelado" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f97316] shadow-xs">
        <span className="text-[9px] font-black tracking-tighter text-white">payt</span>
      </div>
    ),
  },
  {
    id: "hotmart",
    name: "Hotmart",
    defaultEvent: "abandono_carrinho",
    events: [
      { value: "abandono_carrinho", label: "Abandono de carrinho" },
      { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
      { value: "pedido_aprovado", label: "Pedido Aprovado" },
      { value: "pedido_cancelado", label: "Pedido Cancelado" },
      { value: "chargeback", label: "Chargeback" },
      { value: "reclamacao", label: "Reclamação" },
      { value: "reembolso", label: "Reembolso" },
    ],
    renderIcon: () => (
      <div className="flex flex-col items-center justify-center">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#ea580c">
          <path d="M12 2C9.5 6 6 9.5 6 14C6 17.3 8.7 20 12 20C15.3 20 18 17.3 18 14C18 9.5 14.5 6 12 2ZM12 18C10.3 18 9 16.7 9 15C9 13.2 10.7 11.5 12 9.5C13.3 11.5 15 13.2 15 15C15 16.7 13.7 18 12 18Z" />
        </svg>
        <span className="text-[7.5px] font-extrabold tracking-tight text-[#ea580c] leading-tight">
          hotmart
        </span>
      </div>
    ),
  },
  {
    id: "braip",
    name: "Braip",
    defaultEvent: "abandono_carrinho",
    events: [
      { value: "abandono_carrinho", label: "Abandono de carrinho" },
      { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
      { value: "pedido_aprovado", label: "Pedido aprovado" },
      { value: "pedido_cancelado", label: "Pedido Cancelado" },
      { value: "chargeback", label: "Chargeback" },
      { value: "reembolso", label: "Reembolso" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6d28d9] shadow-xs">
        <span className="text-[8.5px] font-black tracking-tight text-white">BRAIP</span>
      </div>
    ),
  },
  {
    id: "yampi",
    name: "Yampi",
    defaultEvent: "pedido_criado",
    events: [
      { value: "pedido_criado", label: "Pedido criado(Aguardando Pagamento)" },
      { value: "pedido_aprovado", label: "Pedido aprovado" },
      { value: "carrinho_abandonado", label: "Notificação de carrinho abandonado" },
      { value: "pagamento_recusado", label: "Pagamento recusado" },
      { value: "pedido_cancelado", label: "Pedido cancelado" },
      { value: "pedido_faturado", label: "Pedido faturado" },
      { value: "pedido_enviado", label: "Pedido enviado" },
      { value: "pedido_entregue", label: "Pedido entregue" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-pink-500 via-rose-500 to-purple-500 shadow-xs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          <path d="M12 21.35L10.55 20.03C5.4 15.36 2 12.28 2 8.5C2 5.42 4.42 3 7.5 3C9.24 3 10.91 3.81 12 5.09C13.09 3.81 14.76 3 16.5 3C19.58 3 22 5.42 22 8.5C22 12.28 18.6 15.36 13.45 20.04L12 21.35Z" />
        </svg>
      </div>
    ),
  },
  {
    id: "cakto",
    name: "Cakto",
    defaultEvent: "boleto_gerado",
    events: [
      { value: "boleto_gerado", label: "Boleto gerado" },
      { value: "pix_gerado", label: "Pix gerado" },
      { value: "picpay_gerado", label: "Picpay gerado" },
      { value: "compra_aprovada", label: "Compra aprovada" },
      { value: "carrinho_abandonado", label: "Carrinho abandonado" },
      { value: "reembolso", label: "Reembolso" },
      { value: "chargeback", label: "Chargeback" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#365314] shadow-xs">
        {/* Ícone cacto estilizado Cakto */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
          <path d="M11 2C10.45 2 10 2.45 10 3V10H7C6.45 10 6 10.45 6 11V13C6 14.66 7.34 16 9 16H10V21C10 21.55 10.45 22 11 22H13C13.55 22 14 21.55 14 21V15H15C16.66 15 18 13.66 18 12V10C18 9.45 17.55 9 17 9H14V3C14 2.45 13.55 2 13 2H11Z" />
        </svg>
      </div>
    ),
  },
  {
    id: "asaas",
    name: "Asaas",
    defaultEvent: "cobranca_criada",
    events: [
      { value: "cobranca_criada", label: "Cobrança: criada" },
      { value: "aguardando_analise_risco", label: "Cobrança: aguardando análise de risco" },
      { value: "aprovada_analise_risco", label: "Cobrança: aprovada pela análise de risco" },
      { value: "reprovada_analise_risco", label: "Cobrança: reprovada pela análise de risco" },
      { value: "cobranca_recebida", label: "Cobrança: recebida" },
      { value: "cobranca_vencida", label: "Cobrança: vencida" },
      { value: "cobranca_estornada", label: "Cobrança: estornada" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#002f6c] shadow-xs">
        <span className="text-[7.5px] font-black tracking-tighter text-white">ASAAS</span>
      </div>
    ),
  },
  {
    id: "bestfy",
    name: "Bestfy",
    defaultEvent: "processando",
    events: [
      { value: "processando", label: "Processando" },
      { value: "autorizado", label: "Autorizado" },
      { value: "aprovado", label: "Aprovado" },
      { value: "reembolsado", label: "Reembolsado" },
      { value: "cancelado", label: "Cancelado" },
      { value: "chargeback", label: "Chargeback" },
    ],
    renderIcon: () => (
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#059669] shadow-xs">
        <span className="font-serif text-sm font-bold text-white lowercase">b</span>
      </div>
    ),
  },
  {
    id: "tray",
    name: "Tray",
    defaultEvent: "aguardando_pagamento",
    events: [
      { value: "aguardando_pagamento", label: "Aguardando Pagamento" },
      { value: "pagamento_efetuado", label: "Pagamento efetuado" },
      { value: "pedido_cancelado", label: "Pedido cancelado" },
      { value: "carrinho_abandonado", label: "Carrinho abandonado" },
    ],
    renderIcon: () => (
      <div className="flex flex-col items-center justify-center">
        <span className="text-[9px] font-black tracking-tight text-[#0284c7]">tray</span>
        <svg width="13" height="10" viewBox="0 0 24 24" fill="#0284c7">
          <path d="M7 18C5.9 18 5 18.9 5 20C5 21.1 5.9 22 7 22C8.1 22 9 21.1 9 20C9 18.9 8.1 18 7 18ZM1 2V4H3L6.6 11.6L5.2 14C5.1 14.3 5 14.6 5 15C5 16.1 5.9 17 7 17H19V15H7.4C7.3 15 7.2 14.9 7.2 14.8L7.3 14.6L8.1 13H15.5C16.3 13 17 12.6 17.3 12L20.9 5.5C21 5.3 21 5.2 21 5C21 4.4 20.6 4 20 4H5.2L4.3 2H1Z" />
        </svg>
      </div>
    ),
  },
];

export function NewFlowDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"oficial" | "business">("business");
  const [selectedProvider, setSelectedProvider] = useState("whatsapp");
  const [selectedEvent, setSelectedEvent] = useState("mensagem_recebida");
  const [keyword, setKeyword] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const create = useCreateFollowupFlow();

  const provider = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0]!;
  const dividerBadgeLabel =
    selectedProvider === "whatsapp"
      ? "Mensagem recebida"
      : selectedProvider === "webhook"
      ? "Webhook"
      : provider.name;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);

    const trimmed = name.trim();
    if (trimmed.length < 4) {
      setErro(t("O nome deve conter no mínimo 4 caracteres"));
      return;
    }

    create.mutate(trimmed, {
      onSuccess: (created) => {
        if (typeof window !== "undefined" && created?.id) {
          try {
            localStorage.setItem(`flow_channel_${created.id}`, channel);
            localStorage.setItem(`flow_provider_${created.id}`, selectedProvider);
            localStorage.setItem(`flow_event_${created.id}`, selectedEvent || provider.defaultEvent);
            if (keyword.trim()) {
              localStorage.setItem(`flow_keyword_${created.id}`, keyword.trim());
            }
          } catch {
            // silent
          }
        }
        setName("");
        setKeyword("");
        setErro(null);
        onOpenChange(false);
        if (created?.id && typeof window !== "undefined") {
          window.location.assign(`/app/ai/followups/${created.id}`);
        }
      },
      onError: (err: unknown) => {
        setErro(
          err instanceof Error && err.message
            ? t(err.message)
            : t("Não consegui criar o fluxo. Tente de novo."),
        );
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setName("");
          setErro(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[540px] overflow-hidden rounded-2xl border-0 p-0 shadow-2xl [&>button]:hidden">
        <DialogTitle className="sr-only">{t("Criar um novo fluxo")}</DialogTitle>

        {/* ═══ CABEÇALHO ROXO ACASSIA / LALLA ═══ */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#9333ea] to-[#7e22ce] px-5 py-3.5 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center text-white/90">
            <ShareNetwork size={20} weight="bold" aria-hidden />
          </div>

          <h2 className="flex-1 text-center font-sans text-[15px] font-bold tracking-tight text-white">
            {t("Criar um novo fluxo")}
          </h2>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t("Fechar")}
            className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white text-[#7e22ce] shadow-xs transition-transform hover:scale-105 active:scale-95"
          >
            <X size={14} weight="bold" aria-hidden />
          </button>
        </div>

        {/* ═══ FORMULÁRIO ═══ */}
        <form onSubmit={onSubmit} className="space-y-4 bg-white px-7 py-5 font-sans dark:bg-neutral-900">
          {/* Seletor Pílula: Whatsapp API Oficial | Whatsapp Business */}
          <div className="flex justify-center pt-1 pb-1">
            <div className="inline-flex items-center rounded-full border border-purple-200/90 bg-neutral-50/70 p-1 shadow-xs dark:border-purple-900/50 dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setChannel("oficial")}
                className={cn(
                  "cursor-pointer rounded-full px-6 py-1.5 text-xs font-semibold transition-all",
                  channel === "oficial"
                    ? "bg-gradient-to-r from-[#9333ea] to-[#8b5cf6] text-white shadow-md shadow-purple-500/35"
                    : "text-[#7e22ce] hover:text-purple-900 dark:text-purple-300",
                )}
              >
                Whatsapp API Oficial
              </button>
              <button
                type="button"
                onClick={() => setChannel("business")}
                className={cn(
                  "cursor-pointer rounded-full px-6 py-1.5 text-xs font-semibold transition-all",
                  channel === "business"
                    ? "bg-gradient-to-r from-[#9333ea] to-[#8b5cf6] text-white shadow-md shadow-purple-500/35"
                    : "text-[#7e22ce] hover:text-purple-900 dark:text-purple-300",
                )}
              >
                Whatsapp Business
              </button>
            </div>
          </div>

          {/* Campo: Título do fluxo * */}
          <div className="space-y-1">
            <Label htmlFor="flow-name" className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              {t("Título do fluxo")} <span className="sr-only">Nome</span><span className="text-rose-500">*</span>
            </Label>
            <Input
              id="flow-name"
              aria-label="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("Ex: Recuperação de carrinho abandonado")}
              className="h-10 rounded-lg border-neutral-300 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-neutral-700"
              maxLength={80}
              required
              autoFocus
            />
            <p className="text-[11px] text-neutral-400">
              {t("O nome deve conter no mínimo 4 caracteres")}
            </p>
          </div>

          {/* Campo: Gatilho * com Grade 2x6 */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              {t("Gatilho")} <span className="text-rose-500">*</span>
            </Label>
            <div className="grid grid-cols-6 gap-2">
              {PROVIDERS.map((p) => {
                const isSelected = selectedProvider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(p.id);
                      setSelectedEvent("");
                    }}
                    className={cn(
                      "flex h-12 w-full cursor-pointer items-center justify-center rounded-xl border bg-white p-1 transition-all shadow-2xs dark:bg-neutral-800",
                      isSelected
                        ? "border-2 border-purple-600 ring-2 ring-purple-500/30 shadow-xs"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700",
                    )}
                    title={p.name}
                  >
                    {p.renderIcon()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Divisor com Evento de gatilho */}
          <div className="relative flex items-center justify-center pt-2 pb-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
            </div>
            <div className="relative flex items-center gap-1.5 bg-white px-3 text-xs text-neutral-500 dark:bg-neutral-900">
              <span>{t("Evento de gatilho")}</span>
              <span className="rounded-md bg-neutral-100 px-2 py-0.5 font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {t(dividerBadgeLabel)}
              </span>
            </div>
          </div>

          {/* Campo: Evento * */}
          <div className="space-y-1">
            <Label htmlFor="event-select" className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              {t("Evento")} <span className="text-rose-500">*</span>
            </Label>
            <Select value={selectedEvent} onValueChange={setSelectedEvent}>
              <SelectTrigger id="event-select" className="h-10 rounded-lg border-neutral-300 text-sm">
                <SelectValue placeholder={t("Selecione um evento")} />
              </SelectTrigger>
              <SelectContent className="max-h-56 overflow-y-auto">
                {provider.events.map((ev) => (
                  <SelectItem key={ev.value} value={ev.value}>
                    {t(ev.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campo: Palavra-chave (quando o gatilho é WhatsApp) */}
          {selectedProvider === "whatsapp" && (
            <div className="space-y-1">
              <Label htmlFor="flow-keyword" className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
                {t("Palavra-chave")} <span className="text-[11px] font-normal text-neutral-400">({t("Opcional")})</span>
              </Label>
              <Input
                id="flow-keyword"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={t("Ex: EU QUERO, QUERO SABER MAIS")}
                className="h-10 rounded-lg border-neutral-300 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-500 dark:border-neutral-700"
                maxLength={60}
              />
            </div>
          )}

          {erro && (
            <p role="alert" data-testid="new-flow-error" className="text-xs font-medium text-rose-500">
              {erro}
            </p>
          )}

          {/* Botão de Salvar Fluxo */}
          <div className="pt-1">
            <Button
              type="submit"
              aria-label="Criar fluxo"
              disabled={create.isPending || name.trim().length < 4}
              className="h-11 w-full cursor-pointer rounded-xl bg-gradient-to-r from-[#a855f7] to-[#8b5cf6] hover:from-[#9333ea] hover:to-[#7c3aed] text-white text-sm font-semibold shadow-md shadow-purple-500/25 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              <Check size={16} weight="bold" className="mr-1.5" aria-hidden />
              <span>{create.isPending ? t("Criando…") : t("Salvar Fluxo")}</span>
            </Button>
          </div>

          {/* Dica de rodapé */}
          <p className="text-[10.5px] leading-relaxed text-neutral-400 text-center px-1">
            {t(
              "Você pode utilizar palavras ou frases como palavra-chave. O fluxo será acionado quando o cliente enviar uma mensagem exatamente igual à palavra-chave. Uma dica é copiar o texto pronto que está configurado na sua campanha de mensagem.",
            )}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
