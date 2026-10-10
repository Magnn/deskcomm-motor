"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import {
  Users,
  CurrencyDollar,
  ShoppingBag,
  Trophy,
  CheckCircle,
  ShoppingCart,
  Diamond,
  Megaphone,
  ArrowClockwise,
  Plus,
  DownloadSimple,
  Clock,
  ChatCircleText,
  X,
  WhatsappLogo,
  Info,
} from "@phosphor-icons/react";
import { FunilDaConversaPainel } from "./FunilDaConversaPainel";
import { MotivoDaPerdaPainel } from "./MotivoDaPerdaPainel";
import { ReceitaAtribuidaPainel } from "./ReceitaAtribuidaPainel";

/** De quanto em quanto tempo o painel se relê sozinho, com a aba visível. */
const INTERVALO_DE_ATUALIZACAO_MS = 60_000;

interface KPI {
  valor: number;
  delta: number | null;
}

/** `valor: null` = desconhecido. Nunca vira zero na tela: "não sei" e "zero" são respostas diferentes. */
interface KPIOpcional {
  valor: number | null;
  delta: number | null;
}

type EstadoDoGasto = "ok" | "sem_conexao" | "sem_conta" | "indisponivel" | "restrito";

interface KPIDeGasto extends KPIOpcional {
  estado: EstadoDoGasto;
  moeda: string | null;
}

/** O que o cartão diz quando o gasto não é conhecido, e para onde leva. */
const AVISO_DO_GASTO: Record<Exclude<EstadoDoGasto, "ok">, { texto: string; href: string | null }> = {
  sem_conexao: { texto: "Conecte o Meta Ads para ver o gasto", href: "/app/settings/meta-ads" },
  sem_conta: { texto: "Escolha a conta de anúncios", href: "/app/settings/meta-ads" },
  indisponivel: { texto: "A Meta não respondeu agora", href: "/app/ads/meta" },
  restrito: { texto: "Visível para gestores", href: null },
};

/**
 * A variação contra o período anterior, com sinal. `null` = não há comparação (o gasto de anúncio vem por
 * dia inteiro e "hoje" está pela metade, ou um dos lados é desconhecido): aparece "—", nunca "0%".
 */
function Variacao({ delta }: { delta: number | null | undefined }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  if (delta === null || delta === undefined) {
    return <span title={t("Sem comparação neste período")}>—</span>;
  }
  return (
    <span title={t("vs. período anterior")} data-testid="kpi-variacao">
      {delta > 0 ? "+" : ""}
      {delta.toLocaleString(tagDoIdioma, { maximumFractionDigits: 1 })}%
    </span>
  );
}

interface ChannelSession {
  id: string;
  name: string;
  phone_number: string | null;
  status: string;
}

interface VendaPeriodo {
  label: string;
  valor: number;
  qtd: number;
}

interface VendaHorario {
  hour: number;
  label: string;
  valor: number;
  qtd: number;
}

interface VendaInstancia {
  id: string;
  name: string;
  phone: string;
  vendas: number;
  faturamento: number;
}

interface VendaEstado {
  uf: string;
  count: number;
  valor: number;
}

interface HistoricoVenda {
  id: string;
  number: number;
  contactId: string | null;
  clienteNome: string;
  clienteTelefone: string;
  instanciaNome: string;
  instanciaNumero: string;
  produto: string;
  valor: number;
  status: string;
  data: string;
}

interface ProdutoPerformance {
  name: string;
  valor: number;
  qtd: number;
  percentual: number;
}

interface ConversaoColuna {
  stageId: string;
  stageName: string;
  color: string;
  leadsCount: number;
  valorTotal: number;
}

/** O que a IA consumiu no período. Custo em DÓLAR — é a moeda em que o fornecedor cobra. */
interface ConsumoDeIaDoPainel {
  custoUsd: number;
  delta: number | null;
  tokensLidos: number;
  tokensEscritos: number;
  chamadas: number;
  chamadasSemPreco: number;
  porVendaUsd: number | null;
}

const emDolar = (valor: number): string => valor.toLocaleString("pt-BR", { style: "currency", currency: "USD" });

/** 3.531.659.761 → "3,5 bi". */
const compacto = (valor: number): string =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(valor);

interface DashboardData {
  tab: string;
  totalLeadsAcumulados: number;
  conexoes: ChannelSession[];
  kpis: {
    leadsNovos: KPI;
    faturamento?: KPI;
    vendas?: KPI;
    roas?: KPIOpcional;
    taxaConversao?: KPI;
    ticketMedio?: KPI;
    lucro?: KPI & { descontaAnuncio?: boolean };
    gastoMeta?: KPIDeGasto;
    consumoDeIa?: ConsumoDeIaDoPainel | null;
    leadsAtendidos?: KPI;
    leadsFinalizados?: KPI;
    tempoRespostaMinutos?: KPI;
  };
  vendasPorPeriodo?: VendaPeriodo[];
  vendasPorHorario?: VendaHorario[];
  vendasPorInstancia?: VendaInstancia[];
  vendasPorEstado?: VendaEstado[];
  historicoVendas?: HistoricoVenda[];
  performanceProdutos?: ProdutoPerformance[];
  atendimentosPorHora?: Array<{ hour: number; label: string; count: number }>;
  leadsPorStatus?: Array<{ status: string; count: number }>;
  conversoesPorColuna?: ConversaoColuna[];
  leadsPorAtendente?: Array<{ id: string; name: string; totalAtendimentos: number }>;
}

export function DashboardClient({ orgName }: { orgName: string }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const [activeTab, setActiveTab] = useState<"vendas" | "atendimento" | "receita">("vendas");
  const [period, setPeriod] = useState<string>("today");
  const [selectedChannel, setSelectedChannel] = useState<string>("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<DashboardData | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);
  const [showBanner, setShowBanner] = useState<boolean>(true);
  const [graphMode, setGraphMode] = useState<"valor" | "qtd">("valor");
  const [prodGraphMode, setProdGraphMode] = useState<"valor" | "qtd">("valor");
  const [hoveredPoint, setHoveredPoint] = useState<VendaPeriodo | null>(null);

  // Modal Nova Venda
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [vendaForm, setVendaForm] = useState({
    productName: "",
    amount: "",
    contactPhone: "",
    notes: "",
  });
  const [savingVenda, setSavingVenda] = useState<boolean>(false);

  // Saudação do dia
  const saudacao = useMemo(() => {
    const hora = new Date().getHours();
    if (hora < 12) return { texto: "Bom dia", emoji: "☀️" };
    if (hora < 18) return { texto: "Boa tarde", emoji: "🌤️" };
    return { texto: "Boa noite", emoji: "🌙" };
  }, []);

  // `silencioso` = atualização automática: troca os números sem piscar a tela nem girar o botão.
  const fetchData = useCallback(async (silencioso = false) => {
    // A aba Receita tem a própria leitura (`ReceitaAtribuidaPainel`).
    if (activeTab === "receita") {
      setLoading(false);
      return;
    }
    if (!silencioso) setLoading(true);
    try {
      const url = new URL("/api/v1/dashboard/metrics", window.location.origin);
      url.searchParams.set("tab", activeTab);
      url.searchParams.set("period", period);
      if (selectedChannel !== "all") {
        url.searchParams.set("channelSessionId", selectedChannel);
      }

      const res = await fetch(url.toString());
      if (res.ok) {
        const json = await res.json();
        setData(json.data || json);
        setAtualizadoEm(new Date());
      }
    } catch (e) {
      console.error("Erro ao buscar dados do dashboard:", e);
    } finally {
      setLoading(false);
    }
  }, [activeTab, period, selectedChannel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ATUALIZAÇÃO AUTOMÁTICA. O painel buscava uma vez ao abrir e depois só pelo botão: quem deixa a tela
  // aberta acompanhando o dia via números parados. Agora relê a cada minuto enquanto a aba está visível, e
  // na hora em que a pessoa volta para ela. Aba escondida não consulta (nem banco, nem a cota da Meta); com
  // o formulário de venda aberto também não, para os números não mudarem embaixo de quem está digitando.
  useEffect(() => {
    const reler = () => {
      if (document.visibilityState === "visible" && !isModalOpen) void fetchData(true);
    };
    const relogio = window.setInterval(reler, INTERVALO_DE_ATUALIZACAO_MS);
    document.addEventListener("visibilitychange", reler);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", reler);
    };
  }, [fetchData, isModalOpen]);

  // O gasto e o ROAS podem ser DESCONHECIDOS (sem conexão, sem conta, plataforma fora): o cartão diz isso.
  const gasto = data?.kpis.gastoMeta;
  const roasDoPeriodo = data?.kpis.roas?.valor ?? null;
  const avisoDoGasto = gasto && gasto.estado !== "ok" ? AVISO_DO_GASTO[gasto.estado] : null;

  // Formatação BRL
  const formatBRL = (val?: number) => {
    return (val ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Submeter nova venda
  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendaForm.productName || !vendaForm.amount) return;

    setSavingVenda(true);
    try {
      const valorCents = Math.round(parseFloat(vendaForm.amount.replace(",", ".")) * 100);
      const res = await fetch("/api/v1/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: vendaForm.productName,
          amountCents: valorCents,
          notes: vendaForm.notes,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setVendaForm({ productName: "", amount: "", contactPhone: "", notes: "" });
        fetchData();
      }
    } catch (err) {
      console.error("Erro ao salvar venda:", err);
    } finally {
      setSavingVenda(false);
    }
  };

  // Exportar CSV
  const handleExportCSV = () => {
    if (!data?.historicoVendas || data.historicoVendas.length === 0) return;
    const headers = ["ID", "Numero", "Cliente", "Telefone", "Instancia", "Produto", "Valor_BRL", "Data"];
    const rows = data.historicoVendas.map((v) => [
      v.id,
      v.number,
      `"${v.clienteNome}"`,
      v.clienteTelefone,
      `"${v.instanciaNome}"`,
      `"${v.produto}"`,
      v.valor.toFixed(2),
      v.data,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `vendas_${period}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-surface-elevated text-text p-4 md:p-6 lg:p-8 space-y-6">
      {/* ── HEADER DE BOAS-VINDAS ────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-surface p-5 rounded-2xl border border-border shadow-sm">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-text dark:text-white flex items-center gap-2">
            {saudacao.texto}, {orgName}! {saudacao.emoji}
          </h1>
          <p className="text-sm text-text-muted mt-1">
            {t("Operação")} <strong className="text-text">{orgName}</strong> •{" "}
            <span className="text-accent font-medium">
              {data?.totalLeadsAcumulados ?? 0} {t("leads acumulados")}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-success-bg text-success border border-success">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            {t("Operação Ativa")}
          </span>
        </div>
      </div>

      {/* ── BANNER DE AVISO / DESTAQUE ────────────────────────────────────── */}
      {showBanner && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-950 p-5 text-white border border-indigo-800/40 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                {t("🚀 Conversão no X1")}
              </div>
              <h2 className="text-lg font-bold">{t("Automatize suas Vendas e Acompanhe o ROI em Tempo Real")}</h2>
              <p className="text-xs text-indigo-200/80 max-w-xl">
                {t("Seus fluxos agora disparam sem travas de volume para todos os leads dos seus anúncios. Conecte mais instâncias para escalar suas conversões.")}
              </p>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="absolute top-2 right-2 p-1.5 text-indigo-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
              title="Fechar banner"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── BARRA SUPERIOR DE ABAS E FILTROS ──────────────────────────────── */}
      <div className="bg-surface p-3 rounded-2xl border border-border shadow-sm flex flex-wrap items-center justify-between gap-3">
        {/* Abas [ Vendas ] | [ Atendimento ] */}
        <div className="flex items-center bg-surface-elevated p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("vendas")}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "vendas"
                ? "bg-accent text-white shadow-sm"
                : "text-text-muted hover:text-text dark:hover:text-white"
            }`}
          >
            Vendas
          </button>
          <button
            onClick={() => setActiveTab("atendimento")}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "atendimento"
                ? "bg-accent text-white shadow-sm"
                : "text-text-muted hover:text-text dark:hover:text-white"
            }`}
          >
            Atendimento
          </button>
          <button
            onClick={() => setActiveTab("receita")}
            data-testid="aba-receita"
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
              activeTab === "receita"
                ? "bg-accent text-white shadow-sm"
                : "text-text-muted hover:text-text dark:hover:text-white"
            }`}
          >
            {t("Receita")}
          </button>
        </div>

        {/* Filtros à direita */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Seletor de Período */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="text-xs font-medium bg-surface-elevated border border-border rounded-xl px-3 py-2 text-text focus:outline-hidden focus:ring-2 focus:ring-accent"
          >
            <option value="today">{t("Hoje")}</option>
            <option value="yesterday">{t("Ontem")}</option>
            <option value="7d">{t("Últimos 7 dias")}</option>
            <option value="30d">{t("Últimos 30 dias")}</option>
            <option value="this_month">{t("Este mês")}</option>
            <option value="last_month">{t("Mês passado")}</option>
          </select>

          {/* Seletor de Conexão */}
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="text-xs font-medium bg-surface-elevated border border-border rounded-xl px-3 py-2 text-text focus:outline-hidden focus:ring-2 focus:ring-accent"
          >
            <option value="all">{t("Todas as conexões")}</option>
            {data?.conexoes?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone_number ? `(${c.phone_number})` : ""}
              </option>
            ))}
          </select>

          {/* Moeda fixa */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated border border-border rounded-xl text-xs font-semibold text-text-muted">
            <span>🇧🇷</span> BRL
          </div>

          {atualizadoEm ? (
            <span className="text-xs text-text-muted" data-testid="dashboard-atualizado-em">
              {t("Atualizado às")} {atualizadoEm.toLocaleTimeString(tagDoIdioma, { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}

          {/* Botão de Reload */}
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="p-2 text-text-muted hover:text-accent bg-surface-elevated border border-border rounded-xl transition-colors disabled:opacity-50"
            title="Atualizar dados"
          >
            <ArrowClockwise size={16} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ABA VENDAS                                                          */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "vendas" && (
        <div className="space-y-6">
          {/* GRID 1: 4 KPIS SUPERIORES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Leads novos */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-info-bg text-info flex items-center justify-center">
                  <Users size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.leadsNovos.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {data?.kpis.leadsNovos.valor ?? 0}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>Leads novos</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 2. Faturamento */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-success-bg text-success flex items-center justify-center">
                  <CurrencyDollar size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.faturamento?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {formatBRL(data?.kpis.faturamento?.valor)}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>Faturamento</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 3. Vendas */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <ShoppingBag size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.vendas?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {data?.kpis.vendas?.valor ?? 0}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>Vendas</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 4. ROAS */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-warning-bg text-warning flex items-center justify-center">
                  <Trophy size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.roas?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div
                  className="text-2xl font-bold text-warning"
                  data-testid="kpi-roas"
                  title={roasDoPeriodo === null ? t("Sem gasto de anúncio conhecido no período, não há ROAS.") : undefined}
                >
                  {roasDoPeriodo === null ? "—" : roasDoPeriodo.toFixed(2)}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>ROAS</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>
          </div>

          {/* GRID 2: 4 KPIS SEGUNDA LINHA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 5. Taxa de Conversão */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-success-bg text-success flex items-center justify-center">
                  <CheckCircle size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.taxaConversao?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {(data?.kpis.taxaConversao?.valor ?? 0).toFixed(2)}%
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>{t("Taxa de Conversão")}</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 6. Ticket Médio */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <ShoppingCart size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.ticketMedio?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {formatBRL(data?.kpis.ticketMedio?.valor)}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>{t("Ticket médio")}</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 7. Lucro */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-info-bg text-info flex items-center justify-center">
                  <Diamond size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={data?.kpis.lucro?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-success">
                  {formatBRL(data?.kpis.lucro?.valor)}
                </div>
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>{data?.kpis.lucro?.descontaAnuncio === false ? t("Lucro (sem descontar anúncio)") : "Lucro"}</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>

            {/* 8. Gasto Meta (Ad) */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-error-bg text-error flex items-center justify-center">
                  <Megaphone size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-muted">
                  <Variacao delta={gasto?.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-error" data-testid="kpi-gasto">
                  {gasto?.estado === "ok" && gasto.valor !== null
                    ? gasto.valor.toLocaleString("pt-BR", { style: "currency", currency: gasto.moeda && gasto.moeda !== "?" ? gasto.moeda : "BRL" })
                    : "—"}
                </div>
                {avisoDoGasto ? (
                  <div className="text-xs text-text-muted" data-testid="kpi-gasto-aviso">
                    {avisoDoGasto.href ? (
                      <a href={avisoDoGasto.href} className="underline">
                        {t(avisoDoGasto.texto)}
                      </a>
                    ) : (
                      t(avisoDoGasto.texto)
                    )}
                  </div>
                ) : null}
                <div className="text-xs text-text-muted flex items-center justify-between mt-1">
                  <span>Gasto Meta (Ad)</span>
                  <Info size={14} className="text-text-subtle" />
                </div>
              </div>
            </div>
          </div>

          {/* ── LINHA DE GRÁFICOS: VENDAS POR PERÍODO E POR HORÁRIO ──────── */}
          {/* O que a IA consumiu no período — ao lado das vendas, que é onde o número vira decisão. */}
          {data?.kpis.consumoDeIa ? (
            <div
              className="bg-surface p-4 rounded-2xl border border-border shadow-sm"
              data-testid="painel-consumo-de-ia"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-text">{t("Consumo de IA no período")}</h3>
                <a href="/app/ai/usage" className="text-xs text-text-muted underline">
                  {t("Ver para onde foram os tokens")}
                </a>
              </div>
              <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <div className="text-2xl font-bold text-text" data-testid="kpi-custo-de-ia">
                    {emDolar(data.kpis.consumoDeIa.custoUsd)}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-2">
                    <span>{t("Custo de IA")}</span>
                    <Variacao delta={data.kpis.consumoDeIa.delta} />
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-text" data-testid="kpi-custo-de-ia-por-venda">
                    {data.kpis.consumoDeIa.porVendaUsd === null ? "—" : emDolar(data.kpis.consumoDeIa.porVendaUsd)}
                  </div>
                  <div className="text-xs text-text-muted">{t("Custo de IA por venda")}</div>
                </div>
                <div>
                  <div
                    className="text-2xl font-bold text-text"
                    data-testid="kpi-tokens"
                    title={`${data.kpis.consumoDeIa.tokensLidos.toLocaleString("pt-BR")} + ${data.kpis.consumoDeIa.tokensEscritos.toLocaleString("pt-BR")}`}
                  >
                    {compacto(data.kpis.consumoDeIa.tokensLidos + data.kpis.consumoDeIa.tokensEscritos)}
                  </div>
                  <div className="text-xs text-text-muted">
                    {t("Tokens")} · {compacto(data.kpis.consumoDeIa.tokensLidos)} {t("lidos")} ·{" "}
                    {compacto(data.kpis.consumoDeIa.tokensEscritos)} {t("escritos")}
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-text">
                    {data.kpis.consumoDeIa.chamadas.toLocaleString("pt-BR")}
                  </div>
                  <div className="text-xs text-text-muted">{t("Chamadas à IA")}</div>
                </div>
              </div>
              {data.kpis.consumoDeIa.chamadasSemPreco > 0 ? (
                <p className="mt-3 text-xs text-text-muted" data-testid="kpi-custo-de-ia-aviso">
                  {data.kpis.consumoDeIa.chamadasSemPreco.toLocaleString("pt-BR")}{" "}
                  {t("chamadas usaram um modelo sem preço conhecido: o custo real é maior que o mostrado.")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Gráfico 1: Vendas por período (2/3 da largura) */}
            <div className="lg:col-span-2 bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-text dark:text-white">{t("Vendas por período")}</h3>
                  <p className="text-xs text-text-muted">{t("Histórico temporal das conversões e faturamento")}</p>
                </div>
                <div className="flex items-center bg-surface-elevated p-1 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setGraphMode("valor")}
                    className={`px-3 py-1 rounded-md transition-all ${
                      graphMode === "valor" ? "bg-accent text-white shadow-sm" : "text-text-muted"
                    }`}
                  >
                    Valor
                  </button>
                  <button
                    onClick={() => setGraphMode("qtd")}
                    className={`px-3 py-1 rounded-md transition-all ${
                      graphMode === "qtd" ? "bg-accent text-white shadow-sm" : "text-text-muted"
                    }`}
                  >
                    Qtd
                  </button>
                </div>
              </div>

              {/* Renderização do gráfico SVG */}
              <div className="relative h-64 w-full pt-4">
                {(!data?.vendasPorPeriodo || data.vendasPorPeriodo.length === 0) ? (
                  <div className="h-full flex items-center justify-center text-text-subtle text-xs">
                    {t("Nenhum dado no período selecionado.")}
                  </div>
                ) : (
                  <div className="h-full w-full flex flex-col justify-between">
                    {/* SVG Curve */}
                    <div className="relative flex-1 w-full">
                      {hoveredPoint && (
                        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-xs px-3 py-1.5 rounded-lg shadow-lg z-10 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span>{hoveredPoint.label}:</span>
                          <strong>{graphMode === "valor" ? formatBRL(hoveredPoint.valor) : `${hoveredPoint.qtd} vendas`}</strong>
                        </div>
                      )}
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 500 150">
                        <defs>
                          <linearGradient id="gradVendas" x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        {/* Linhas de grade horizontal */}
                        <line x1="0" y1="0" x2="500" y2="0" stroke="currentColor" className="text-slate-100" strokeDasharray="3 3" />
                        <line x1="0" y1="50" x2="500" y2="50" stroke="currentColor" className="text-slate-100" strokeDasharray="3 3" />
                        <line x1="0" y1="100" x2="500" y2="100" stroke="currentColor" className="text-slate-100" strokeDasharray="3 3" />
                        <line x1="0" y1="140" x2="500" y2="140" stroke="currentColor" className="text-slate-200" />

                        {/* Coordenadas calculadas */}
                        {(() => {
                          const pontos = data.vendasPorPeriodo || [];
                          const maxVal = Math.max(...pontos.map((p) => (graphMode === "valor" ? p.valor : p.qtd)), 1);
                          const stepX = pontos.length > 1 ? 500 / (pontos.length - 1) : 250;

                          const coords = pontos.map((p, i) => {
                            const val = graphMode === "valor" ? p.valor : p.qtd;
                            const y = 140 - (val / maxVal) * 120;
                            const x = i * stepX;
                            return { x, y, p };
                          });

                          const pathD = coords.reduce(
                            (acc, c, i) => (i === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`),
                            ""
                          );
                          const areaD = `${pathD} L 500 140 L 0 140 Z`;

                          return (
                            <>
                              <path d={areaD} fill="url(#gradVendas)" />
                              <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2.5" />
                              {coords.map((c, i) => (
                                <circle
                                  key={i}
                                  cx={c.x}
                                  cy={c.y}
                                  r="4"
                                  className="fill-white stroke-emerald-500 stroke-2 hover:r-6 cursor-pointer transition-all"
                                  onMouseEnter={() => setHoveredPoint(c.p)}
                                  onMouseLeave={() => setHoveredPoint(null)}
                                />
                              ))}
                            </>
                          );
                        })()}
                      </svg>
                    </div>

                    {/* Labels X */}
                    <div className="flex justify-between text-[11px] text-text-subtle mt-2 px-1">
                      {data.vendasPorPeriodo.map((p, i) => (
                        <span key={i} className="truncate">{p.label}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Gráfico 2: Vendas por horário (1/3 da largura) */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-text dark:text-white">{t("Vendas por horário")}</h3>
                <p className="text-xs text-text-muted">Total de vendas por hora do dia</p>
              </div>

              <div className="h-64 flex flex-col justify-end pt-4">
                <div className="flex items-end justify-between gap-1 h-48 border-b border-border pb-1">
                  {(data?.vendasPorHorario || []).map((h, i) => {
                    const maxQtd = Math.max(...(data?.vendasPorHorario?.map((item) => item.qtd) || [1]), 1);
                    const heightPercent = h.qtd > 0 ? (h.qtd / maxQtd) * 100 : 4;
                    return (
                      <div
                        key={i}
                        // `h-full justify-end`: sem altura na coluna, o `height: N%` da barra não tem do que
                        // ser porcentagem e a barra some — o gráfico ficava em branco mesmo com venda.
                        className="flex-1 h-full flex flex-col items-center justify-end group relative cursor-pointer"
                        data-testid="barra-do-horario"
                        title={`${h.label}: ${h.qtd} vendas (${formatBRL(h.valor)})`}
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full max-w-[12px] rounded-t transition-all ${
                            h.qtd > 0 ? "bg-accent group-hover:bg-accent-hover" : "bg-border"
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[10px] text-text-subtle mt-2">
                  <span>00h</span>
                  <span>06h</span>
                  <span>12h</span>
                  <span>18h</span>
                  <span>23h</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── LINHA DE DISTRIBUIÇÕES: INSTÂNCIA & ESTADO ─────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Vendas por instância */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-text dark:text-white">{t("Vendas por instância")}</h3>
                <p className="text-xs text-text-muted">{t("Operações por conexão ativa")}</p>
              </div>
              {(!data?.vendasPorInstancia || data.vendasPorInstancia.length === 0) ? (
                <div className="h-32 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum dado no período selecionado.")}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {data.vendasPorInstancia.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated text-xs">
                      <div className="flex items-center gap-2">
                        <WhatsappLogo size={18} className="text-success" />
                        <div>
                          <div className="font-semibold text-text">{inst.name}</div>
                          <div className="text-[11px] text-text-subtle">{inst.phone}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-text dark:text-white">{inst.vendas} vendas</div>
                        <div className="text-[11px] text-success">{formatBRL(inst.faturamento)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Faturamento por instância */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-text dark:text-white">{t("Faturamento por instância")}</h3>
                <p className="text-xs text-text-muted">{t("Receita por conexão ativa")}</p>
              </div>
              {(!data?.vendasPorInstancia || data.vendasPorInstancia.length === 0) ? (
                <div className="h-32 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum dado no período selecionado.")}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {data.vendasPorInstancia.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated text-xs">
                      <div className="font-semibold text-text">{inst.name}</div>
                      <div className="font-bold text-success">{formatBRL(inst.faturamento)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Vendas por estado */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <div>
                <h3 className="text-sm font-bold text-text dark:text-white">Vendas por estado</h3>
                <p className="text-xs text-text-muted">{t("Distribuição geográfica das vendas")}</p>
              </div>
              {(!data?.vendasPorEstado || data.vendasPorEstado.length === 0) ? (
                <div className="h-32 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum dado no período selecionado.")}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 mt-2 max-h-36 overflow-y-auto">
                  {data.vendasPorEstado.map((est) => (
                    <div key={est.uf} className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated text-xs">
                      <span className="font-bold text-text-muted">{est.uf}</span>
                      <span className="text-text-muted font-medium">
                        {est.count} ({formatBRL(est.valor)})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── LINHA DE TABELA E PERFORMANCE DE PRODUTOS ──────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Tabela: Histórico de Vendas (2/3) */}
            <div className="lg:col-span-2 bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-text dark:text-white">{t("Histórico de vendas")}</h3>
                  <p className="text-xs text-text-muted">{t("Auditoria e emissão de conversões")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-text-muted hover:bg-surface-elevated transition-colors"
                  >
                    <DownloadSimple size={14} />
                    Exportar CSV
                  </button>
                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm"
                  >
                    <Plus size={14} weight="bold" />
                    Nova venda
                  </button>
                </div>
              </div>

              {/* Tabela de Vendas */}
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-elevated text-text-muted uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3">{t("Instância")}</th>
                      <th className="py-2.5 px-3">Nº Lead</th>
                      <th className="py-2.5 px-3">Cliente</th>
                      <th className="py-2.5 px-3">Produto</th>
                      <th className="py-2.5 px-3">Valor</th>
                      <th className="py-2.5 px-3">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(!data?.historicoVendas || data.historicoVendas.length === 0) ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-text-subtle text-xs">
                          {t("Nenhuma venda registrada no histórico do período.")}
                        </td>
                      </tr>
                    ) : (
                      data.historicoVendas.map((v) => (
                        <tr key={v.id} className="hover:bg-surface-elevated transition-colors">
                          <td className="py-2.5 px-3 font-medium text-text">
                            {v.instanciaNome}
                          </td>
                          <td className="py-2.5 px-3 text-text-muted">{v.clienteTelefone}</td>
                          <td className="py-2.5 px-3 font-semibold text-text dark:text-white">{v.clienteNome}</td>
                          <td className="py-2.5 px-3 text-text-muted">{v.produto}</td>
                          <td className="py-2.5 px-3 font-bold text-success">
                            {formatBRL(v.valor)}
                          </td>
                          <td className="py-2.5 px-3 text-text-subtle text-[11px]">
                            {new Date(v.data).toLocaleDateString(tagDoIdioma, {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Performance dos Produtos (1/3) */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text dark:text-white">Performance dos produtos</h3>
                  <p className="text-xs text-text-muted">{t("Participação no total")}</p>
                </div>
                <div className="flex items-center bg-surface-elevated p-1 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setProdGraphMode("valor")}
                    className={`px-2.5 py-0.5 rounded-md ${
                      prodGraphMode === "valor" ? "bg-accent text-white" : "text-text-muted"
                    }`}
                  >
                    Valor
                  </button>
                  <button
                    onClick={() => setProdGraphMode("qtd")}
                    className={`px-2.5 py-0.5 rounded-md ${
                      prodGraphMode === "qtd" ? "bg-accent text-white" : "text-text-muted"
                    }`}
                  >
                    Qtd
                  </button>
                </div>
              </div>

              {(!data?.performanceProdutos || data.performanceProdutos.length === 0) ? (
                <div className="h-48 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum dado no período selecionado.")}
                </div>
              ) : (
                <div className="space-y-3 mt-3">
                  {data.performanceProdutos.map((p, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-text truncate">{p.name}</span>
                        <span className="text-text-muted">
                          {prodGraphMode === "valor" ? formatBRL(p.valor) : `${p.qtd} un.`} ({p.percentual}%)
                        </span>
                      </div>
                      <div className="w-full bg-surface-elevated h-2 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${p.percentual}%` }}
                          className="bg-accent h-full rounded-full transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* ABA ATENDIMENTO                                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === "atendimento" && (
        <div className="space-y-6">
          {/* 4 KPIS DE ATENDIMENTO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Leads novos */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-info-bg text-info flex items-center justify-center">
                  <Users size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated">
                  <Variacao delta={data?.kpis.leadsNovos.delta} />
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {data?.kpis.leadsNovos.valor ?? 0}
                </div>
                <div className="text-xs text-text-muted mt-1">Leads novos</div>
              </div>
            </div>

            {/* Leads atendidos */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center">
                  <ChatCircleText size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated">
                  ~0.0%
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {data?.kpis.leadsAtendidos?.valor ?? 0}
                </div>
                <div className="text-xs text-text-muted mt-1">Leads atendidos</div>
              </div>
            </div>

            {/* Leads finalizados */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-success-bg text-success flex items-center justify-center">
                  <CheckCircle size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated">
                  ~0.0%
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-text dark:text-white">
                  {data?.kpis.leadsFinalizados?.valor ?? 0}
                </div>
                <div className="text-xs text-text-muted mt-1">Leads finalizados</div>
              </div>
            </div>

            {/* Tempo de resposta */}
            <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between text-text-muted">
                <div className="w-9 h-9 rounded-xl bg-warning-bg text-warning flex items-center justify-center">
                  <Clock size={20} weight="bold" />
                </div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-surface-elevated">
                  ~0.0%
                </span>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-bold text-warning">
                  {(data?.kpis.tempoRespostaMinutos?.valor ?? 0) > 0
                    ? `${data?.kpis.tempoRespostaMinutos?.valor} min`
                    : "Em breve"}
                </div>
                <div className="text-xs text-text-muted mt-1">Tempo de resposta</div>
              </div>
            </div>
          </div>

          {/* GRÁFICOS DE ATENDIMENTO */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Atendimentos por hora */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <h3 className="text-base font-bold text-text dark:text-white">Atendimentos por hora</h3>
              <p className="text-xs text-text-muted">{t("Distribuição horária das conversas iniciadas")}</p>

              <div className="h-44 flex items-end justify-between gap-1 border-b border-border pb-1 pt-4">
                {(data?.atendimentosPorHora || []).map((h, i) => {
                  const maxCount = Math.max(...(data?.atendimentosPorHora?.map((x) => x.count) || [1]), 1);
                  const hPct = h.count > 0 ? (h.count / maxCount) * 100 : 4;
                  return (
                    <div key={i} className="flex-1 h-full flex flex-col items-center justify-end group relative cursor-pointer" title={`${h.label}: ${h.count} atendimentos`}>
                      <div
                        style={{ height: `${hPct}%` }}
                        className={`w-full max-w-[10px] rounded-t transition-all ${
                          h.count > 0 ? "bg-accent" : "bg-border"
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-text-subtle mt-1">
                <span>00h</span>
                <span>06h</span>
                <span>12h</span>
                <span>18h</span>
                <span>23h</span>
              </div>
            </div>

            {/* Leads por Status */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <h3 className="text-base font-bold text-text dark:text-white">Leads por status</h3>
              <p className="text-xs text-text-muted">{t("Distribuição dos atendimentos")}</p>

              {(!data?.leadsPorStatus || data.leadsPorStatus.length === 0) ? (
                <div className="h-44 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum atendimento registrado no período.")}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {data.leadsPorStatus.map((st, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-muted">{st.status}</span>
                      <span className="px-2.5 py-0.5 rounded-full bg-surface-elevated font-bold text-text dark:text-white">
                        {st.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* CONVERSÕES E VALOR POR COLUNA DO KANBAN */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Conversões por coluna */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <h3 className="text-base font-bold text-text dark:text-white">{t("Conversões por coluna (Kanban)")}</h3>
              <p className="text-xs text-text-muted">{t("Leads ativos por estágio do funil")}</p>

              {(!data?.conversoesPorColuna || data.conversoesPorColuna.length === 0) ? (
                <div className="h-32 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum dado de funil encontrado.")}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {data.conversoesPorColuna.map((c) => (
                    <div key={c.stageId} className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                        <span className="font-semibold text-text">{c.stageName}</span>
                      </div>
                      <span className="font-bold text-text dark:text-white">{c.leadsCount} leads</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Valor por coluna */}
            <div className="bg-surface p-5 rounded-2xl border border-border shadow-sm space-y-3">
              <h3 className="text-base font-bold text-text dark:text-white">Valor estimado por coluna</h3>
              <p className="text-xs text-text-muted">{t("Potencial financeiro em cada etapa")}</p>

              {(!data?.conversoesPorColuna || data.conversoesPorColuna.length === 0) ? (
                <div className="h-32 flex items-center justify-center text-text-subtle text-xs">
                  {t("Nenhum valor estimado encontrado.")}
                </div>
              ) : (
                <div className="space-y-2 mt-2">
                  {data.conversoesPorColuna.map((c) => (
                    <div key={c.stageId} className="flex items-center justify-between p-2 rounded-xl bg-surface-elevated text-xs">
                      <span className="font-semibold text-text">{c.stageName}</span>
                      <span className="font-bold text-success">{formatBRL(c.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL NOVA VENDA ─────────────────────────────────────────────── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text dark:text-white flex items-center gap-2">
                <Plus size={18} className="text-accent" />
                Registrar Nova Venda
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-text-subtle hover:text-text-muted dark:hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSale} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Produto / Oferta *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Livro Segredos da Noiva 2.0"
                  value={vendaForm.productName}
                  onChange={(e) => setVendaForm({ ...vendaForm, productName: e.target.value })}
                  className="w-full text-xs bg-surface-elevated border border-border rounded-xl px-3 py-2 text-text dark:text-white focus:outline-hidden focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  Valor (R$) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 10,00"
                  value={vendaForm.amount}
                  onChange={(e) => setVendaForm({ ...vendaForm, amount: e.target.value })}
                  className="w-full text-xs bg-surface-elevated border border-border rounded-xl px-3 py-2 text-text dark:text-white focus:outline-hidden focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1">
                  {t("Observações adicionais (opcional)")}
                </label>
                <textarea
                  placeholder="Ex: Pagamento confirmado via PIX"
                  rows={2}
                  value={vendaForm.notes}
                  onChange={(e) => setVendaForm({ ...vendaForm, notes: e.target.value })}
                  className="w-full text-xs bg-surface-elevated border border-border rounded-xl px-3 py-2 text-text dark:text-white focus:outline-hidden focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-surface-elevated transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingVenda}
                  className="px-5 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm disabled:opacity-50"
                >
                  {savingVenda ? "Salvando..." : "Confirmar Venda"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {activeTab === "receita" && (
        <div className="space-y-6">
          <ReceitaAtribuidaPainel period={period} tagDoIdioma={tagDoIdioma} />
          <FunilDaConversaPainel period={period} />
          <MotivoDaPerdaPainel period={period} />
        </div>
      )}
    </div>
  );
}
