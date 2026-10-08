"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, Plus, Trash } from "lucide-react";

import {
  agentNodeConfigSchema,
  AGENT_NODE_DEFAULT_MAX_TURNS,
  AGENT_NODE_DEFAULT_SILENCE_MINUTES,
  AGENT_NODE_UNSET_ID,
} from "@/lib/followup/graph-schema";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { useT } from "@/hooks/i18n/useT";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { ConfigOf } from "./shared";

interface GptModelOption {
  id: string;
  name: string;
  badge: string;
  badgeVariant: "green" | "blue" | "amber" | "purple";
  subtitle: string;
}

const GPT_MODELS: GptModelOption[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    badge: "Econômico",
    badgeVariant: "green",
    subtitle: "Menor custo, bom para respostas simples e frequentes.",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    badge: "Equilibrado",
    badgeVariant: "blue",
    subtitle: "Boa qualidade com custo moderado.",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    badge: "Maior custo",
    badgeVariant: "amber",
    subtitle: "Use quando precisar de respostas mais complexas.",
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    badge: "Avançado",
    badgeVariant: "purple",
    subtitle: "Modelo avançado com custo mais alto.",
  },
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    badge: "Avançado",
    badgeVariant: "purple",
    subtitle: "Modelo avançado com custo mais alto.",
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    badge: "Equilibrado",
    badgeVariant: "blue",
    subtitle: "Boa qualidade com custo moderado.",
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    badge: "Econômico",
    badgeVariant: "green",
    subtitle: "Menor custo para mensagens simples em escala.",
  },
];

export function AgentForm({
  config,
  onChange,
}: {
  config: ConfigOf<"agent">;
  onChange: (c: ConfigOf<"agent">) => void;
}) {
  const t = useT();
  const { data: agentesList } = useAgentsList();

  const [agentId, setAgentId] = useState(config.agent_id ?? AGENT_NODE_UNSET_ID);
  const [objetivo, setObjetivo] = useState(config.objetivo ?? "Atender o lead com IA");
  const [maxTurnos, setMaxTurnos] = useState(config.max_turnos ?? AGENT_NODE_DEFAULT_MAX_TURNS);
  const [silencioMinutos, setSilencioMinutos] = useState(
    config.silencio_minutos ?? AGENT_NODE_DEFAULT_SILENCE_MINUTES
  );

  // AcassIA parity states
  const [modeloGpt, setModeloGpt] = useState(config.modelo_gpt ?? "gpt-4.1");
  const [pesquisarInternet, setPesquisarInternet] = useState(config.pesquisar_internet ?? false);
  const [pesquisarArquivos, setPesquisarArquivos] = useState(config.pesquisar_arquivos ?? false);
  const [leituraImagemPdf, setLeituraImagemPdf] = useState(config.leitura_imagem_pdf ?? false);
  const [responderComAudio, setResponderComAudio] = useState(config.responder_com_audio ?? true);
  const [desativarQuebra, setDesativarQuebra] = useState(
    config.desativar_quebra_mensagens ?? false
  );

  const [rotas, setRotas] = useState<Array<{ id: string; condicao: string; label: string }>>(
    config.rotas && config.rotas.length > 0
      ? config.rotas
      : [{ id: "rota-1", condicao: "AVANÇAR", label: "Rota 1" }]
  );

  // Tempos e limites
  const [agruparSegundos, setAgruparSegundos] = useState(
    config.agrupar_respostas_segundos ?? 15
  );
  const [expiracaoTempo, setExpiracaoTempo] = useState(
    config.expiracao_tempo ?? 1
  );
  const [expiracaoUnidade, setExpiracaoUnidade] = useState<
    "segundos" | "minutos" | "horas" | "dias"
  >(config.expiracao_unidade ?? "horas");

  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (patch: Partial<ConfigOf<"agent">>) => {
    const candidate = {
      agent_id: patch.agent_id !== undefined ? patch.agent_id : agentId,
      objetivo: patch.objetivo !== undefined ? patch.objetivo : objetivo,
      max_turnos: patch.max_turnos !== undefined ? patch.max_turnos : maxTurnos,
      silencio_minutos: patch.silencio_minutos !== undefined ? patch.silencio_minutos : silencioMinutos,
      modelo_gpt: patch.modelo_gpt !== undefined ? patch.modelo_gpt : modeloGpt,
      pesquisar_internet: patch.pesquisar_internet !== undefined ? patch.pesquisar_internet : pesquisarInternet,
      pesquisar_arquivos: patch.pesquisar_arquivos !== undefined ? patch.pesquisar_arquivos : pesquisarArquivos,
      leitura_imagem_pdf: patch.leitura_imagem_pdf !== undefined ? patch.leitura_imagem_pdf : leituraImagemPdf,
      responder_com_audio: patch.responder_com_audio !== undefined ? patch.responder_com_audio : responderComAudio,
      desativar_quebra_mensagens: patch.desativar_quebra_mensagens !== undefined ? patch.desativar_quebra_mensagens : desativarQuebra,
      rotas: patch.rotas !== undefined ? patch.rotas : rotas,
      agrupar_respostas_segundos: patch.agrupar_respostas_segundos !== undefined ? patch.agrupar_respostas_segundos : agruparSegundos,
      expiracao_tempo: patch.expiracao_tempo !== undefined ? patch.expiracao_tempo : expiracaoTempo,
      expiracao_unidade: patch.expiracao_unidade !== undefined ? patch.expiracao_unidade : expiracaoUnidade,
    };

    const parsed = agentNodeConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const handleAddRoute = () => {
    const nextNum = rotas.length + 1;
    const newRoute = {
      id: `rota-${Date.now()}`,
      condicao: "AVANÇAR",
      label: `Rota ${nextNum}`,
    };
    const next = [...rotas, newRoute];
    setRotas(next);
    commit({ rotas: next });
  };

  const handleUpdateRoute = (id: string, condicao: string) => {
    const next = rotas.map((r) => (r.id === id ? { ...r, condicao } : r));
    setRotas(next);
    commit({ rotas: next });
  };

  const handleRemoveRoute = (id: string) => {
    if (rotas.length <= 1) return;
    const next = rotas.filter((r) => r.id !== id);
    setRotas(next);
    commit({ rotas: next });
  };

  const currentModel: GptModelOption =
    (GPT_MODELS.find((m) => m.id === modeloGpt) ||
      GPT_MODELS.find((m) => m.name.toLowerCase() === modeloGpt.toLowerCase()) ||
      GPT_MODELS[3]) ?? {
      id: "gpt-4.1",
      name: "GPT-4.1",
      badge: "Avançado",
      badgeVariant: "purple" as const,
      subtitle: "Modelo avançado com custo mais alto.",
    };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* 1. Agente */}
      <div className="space-y-1.5">
        <label
          htmlFor="select-agent-id"
          className="block text-[12px] font-bold text-text"
        >
          {t("Agente")}
        </label>
        <div className="relative">
          <select
            id="select-agent-id"
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
              commit({ agent_id: e.target.value });
            }}
            className="w-full h-10 rounded-lg border border-border bg-surface px-3 pr-8 text-xs text-text-muted focus:outline-hidden appearance-none cursor-pointer"
          >
            <option value={AGENT_NODE_UNSET_ID}>
              {t("Selecione um agente")}
            </option>
            {(agentesList ?? []).map((ag) => (
              <option key={ag.id} value={ag.id}>
                {ag.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={15}
            className="absolute right-3 top-3 text-text-subtle pointer-events-none"
          />
        </div>
      </div>

      {/* 2. Modelo GPT com badges de status (AcassIA) */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-bold text-text">
          {t("Modelo GPT")}
        </label>

        <Popover open={isModelDropdownOpen} onOpenChange={setIsModelDropdownOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full h-10 rounded-lg border border-border bg-surface px-3 flex items-center justify-between text-xs text-text hover:border-border-strong transition-colors cursor-pointer"
            >
              <span className="font-semibold text-text">
                {currentModel.name}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-medium border",
                    currentModel.badgeVariant === "green" &&
                      "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
                    currentModel.badgeVariant === "blue" &&
                      "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
                    currentModel.badgeVariant === "amber" &&
                      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
                    currentModel.badgeVariant === "purple" &&
                      "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
                  )}
                >
                  {currentModel.badge}
                </span>
                <ChevronDown size={15} className="text-text-subtle" />
              </div>
            </button>
          </PopoverTrigger>

          <PopoverContent align="start" className="w-80 p-1.5 space-y-1 max-h-72 overflow-y-auto">
            {GPT_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setModeloGpt(m.id);
                  commit({ modelo_gpt: m.id });
                  setIsModelDropdownOpen(false);
                }}
                className={cn(
                  "w-full text-left p-2.5 rounded-lg transition-colors cursor-pointer border",
                  modeloGpt === m.id
                    ? "bg-purple-50/60 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800"
                    : "hover:bg-surface-elevated border-transparent"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-text">
                    {m.name}
                  </span>
                  <span
                    className={cn(
                      "text-[9.5px] px-2 py-0.5 rounded-full font-medium border",
                      m.badgeVariant === "green" &&
                        "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800",
                      m.badgeVariant === "blue" &&
                        "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800",
                      m.badgeVariant === "amber" &&
                        "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
                      m.badgeVariant === "purple" &&
                        "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800"
                    )}
                  >
                    {m.badge}
                  </span>
                </div>
                <p className="text-[11px] text-text-subtle leading-tight">
                  {m.subtitle}
                </p>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      {/* 3. Toggles de recursos (AcassIA) */}
      <div className="space-y-2">
        {/* Pesquisar na internet */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Pesquisar na internet")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pesquisarInternet}
            onClick={() => {
              const val = !pesquisarInternet;
              setPesquisarInternet(val);
              commit({ pesquisar_internet: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              pesquisarInternet ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                pesquisarInternet ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Pesquisar em arquivos */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Pesquisar em arquivos")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={pesquisarArquivos}
            onClick={() => {
              const val = !pesquisarArquivos;
              setPesquisarArquivos(val);
              commit({ pesquisar_arquivos: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              pesquisarArquivos ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                pesquisarArquivos ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Leitura de imagem e PDF */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Leitura de imagem e PDF")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={leituraImagemPdf}
            onClick={() => {
              const val = !leituraImagemPdf;
              setLeituraImagemPdf(val);
              commit({ leitura_imagem_pdf: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              leituraImagemPdf ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                leituraImagemPdf ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Responder com áudio */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Responder com áudio")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={responderComAudio}
            onClick={() => {
              const val = !responderComAudio;
              setResponderComAudio(val);
              commit({ responder_com_audio: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              responderComAudio ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                responderComAudio ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Desativar quebra de mensagens */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Desativar quebra de mensagens")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={desativarQuebra}
            onClick={() => {
              const val = !desativarQuebra;
              setDesativarQuebra(val);
              commit({ desativar_quebra_mensagens: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              desativarQuebra ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                desativarQuebra ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* 4. Divisor com Botão Adicionar rota */}
      <div className="relative flex items-center justify-center my-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <button
          type="button"
          onClick={handleAddRoute}
          className="relative z-10 inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-border bg-surface text-xs font-semibold text-text-muted shadow-2xs hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <Plus size={13} className="text-text-muted" />
          <span>{t("Adicionar rota")}</span>
        </button>
      </div>

      {/* Lista de Rotas */}
      <div className="space-y-2.5">
        {rotas.map((rota, idx) => (
          <div
            key={rota.id}
            className="rounded-xl border border-border p-2.5 bg-surface space-y-2 shadow-2xs"
          >
            <textarea
              rows={2}
              value={rota.condicao}
              onChange={(e) => handleUpdateRoute(rota.id, e.target.value)}
              placeholder={t("AVANÇAR")}
              className="w-full rounded-md border border-border bg-surface p-2 text-xs font-medium text-text placeholder:text-text-subtle focus:outline-hidden uppercase tracking-wider resize-y"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-blue-500">
                {rota.label || `Rota ${idx + 1}`}
              </span>
              {rotas.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveRoute(rota.id)}
                  className="text-rose-500 hover:text-rose-600 cursor-pointer p-0.5 transition-colors"
                  title={t("Remover rota")}
                >
                  <Trash size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 5. Divisor: Tempos e limites */}
      <div className="flex items-center gap-3 my-3">
        <div className="h-px flex-1 bg-surface-elevated" />
        <span className="text-[11px] font-medium text-text-subtle">
          {t("Tempos e limites")}
        </span>
        <div className="h-px flex-1 bg-surface-elevated" />
      </div>

      {/* Card 1: Agrupar respostas */}
      <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-text">
              {t("Agrupar respostas")}
            </span>
            <span className="rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] px-2 py-0.5 text-[10px] font-medium dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
              {t("a partir da 1ª mensagem")}
            </span>
            <span
              title={t("Reinicia a cada nova mensagem recebida.")}
              className="text-text-subtle hover:text-text-muted cursor-help"
            >
              <HelpCircle size={13} />
            </span>
          </div>
        </div>

        <p className="text-[11px] text-text-subtle">
          {t("Reinicia a cada nova mensagem recebida.")}
        </p>

        <select
          value={agruparSegundos}
          onChange={(e) => {
            const val = Number(e.target.value);
            setAgruparSegundos(val);
            commit({ agrupar_respostas_segundos: val });
          }}
          className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden"
        >
          <option value={15}>{t("15 segundos (padrão)")}</option>
          <option value={30}>{t("30 segundos")}</option>
          <option value={45}>{t("45 segundos")}</option>
          <option value={60}>{t("1 minuto")}</option>
          <option value={120}>{t("2 minutos")}</option>
          <option value={300}>{t("5 minutos")}</option>
          <option value={0}>{t("Não agrupar (resposta única)")}</option>
        </select>
      </div>

      {/* Card 2: Expiração do bloco */}
      <div className="rounded-xl border border-border bg-surface p-3.5 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-text">
              {t("Expiração do bloco")}
            </span>
            <span className="rounded-full bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] px-2 py-0.5 text-[10px] font-medium dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800">
              {t("a partir do envio")}
            </span>
            <span
              title={t("Tempo máximo aguardando a interação do contato.")}
              className="text-text-subtle hover:text-text-muted cursor-help"
            >
              <HelpCircle size={13} />
            </span>
          </div>
        </div>

        <p className="text-[11px] text-text-subtle">
          {t("Tempo máximo aguardando a interação do contato.")}
        </p>

        <div className="grid grid-cols-[1fr_1.3fr] gap-2">
          <input
            type="number"
            min={1}
            max={9999}
            value={expiracaoTempo}
            onChange={(e) => {
              const val = Math.max(1, Number(e.target.value));
              setExpiracaoTempo(val);
              commit({ expiracao_tempo: val });
            }}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden"
          />

          <select
            value={expiracaoUnidade}
            onChange={(e) => {
              const val = e.target.value as "segundos" | "minutos" | "horas" | "dias";
              setExpiracaoUnidade(val);
              commit({ expiracao_unidade: val });
            }}
            className="h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden"
          >
            <option value="horas">{t("Horas")}</option>
            <option value="minutos">{t("Minutos")}</option>
            <option value="dias">{t("Dias")}</option>
            <option value="segundos">{t("Segundos")}</option>
          </select>
        </div>
      </div>

      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
    </div>
  );
}
