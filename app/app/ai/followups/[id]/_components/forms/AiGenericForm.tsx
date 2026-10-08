"use client";

import { useState, useRef } from "react";
import { Eye, ChevronDown, Plus } from "lucide-react";

import { aiGenericConfigSchema, type ReplySaveTo } from "@/lib/followup/graph-schema";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import { usePipelines } from "@/hooks/webhooks/useWebhookSources";
import { useT } from "@/hooks/i18n/useT";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const VARIAVEIS_GPT = [
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
  { tag: "{{nome}}", label: "Nome Completo" },
  { tag: "{{telefone}}", label: "Telefone" },
  { tag: "{{email}}", label: "E-mail" },
  { tag: "{{resposta_anterior}}", label: "Resposta Anterior" },
  { tag: "{{historico_conversa}}", label: "Histórico da Conversa" },
  { tag: "{{etapa_funil}}", label: "Etapa do Funil" },
];

export function AiGenericForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ai_generic">;
  onChange: (c: ConfigOf<"ai_generic">) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState(config.prompt ?? "");
  const [saveTo, setSaveTo] = useState<ReplySaveTo>(config.save_to ?? { kind: "contact_name" });

  // AcassIA parity states
  const [modeloGpt, setModeloGpt] = useState(config.modelo_gpt ?? "gpt-4o-mini");
  const [maxTokens, setMaxTokens] = useState<number>(config.max_tokens ?? 256);
  const [temperature, setTemperature] = useState<number>(config.temperature ?? 0.2);

  // 6 Toggles
  const [enviarResultadoTexto, setEnviarResultadoTexto] = useState(
    config.enviar_resultado_texto ?? true
  );
  const [manterContexto, setManterContexto] = useState(
    config.manter_contexto ?? false
  );
  const [leituraImagemPdf, setLeituraImagemPdf] = useState(
    config.leitura_imagem_pdf ?? false
  );
  const [ativarPersonalidade, setAtivarPersonalidade] = useState(
    config.ativar_personalidade ?? true
  );
  const [ativarBaseInformacoes, setAtivarBaseInformacoes] = useState(
    config.ativar_base_informacoes ?? true
  );
  const [ativarRestricoes, setAtivarRestricoes] = useState(
    config.ativar_restricoes ?? true
  );

  const [salvarEmCampo, setSalvarEmCampo] = useState(
    config.salvar_em_campo ?? true
  );

  // Modais e dropdowns
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isVarsOpen, setIsVarsOpen] = useState(false);
  const [isNewFieldOpen, setIsNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");

  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const pipelines = usePipelines();
  const campos = (pipelines.data?.data ?? []).flatMap((p) => camposDoFunil(p.settings));
  const camposUnicos = [...new Map(campos.map((c) => [c.key, c])).values()];

  const [customFields, setCustomFields] = useState<Array<{ key: string; label: string }>>([
    { key: "peso_altura_lead", label: "PesoAltura_Lead" },
    { key: "resumo_ia", label: "Resumo da IA" },
  ]);

  const commit = (patch: Partial<ConfigOf<"ai_generic">>) => {
    const candidate = {
      prompt: patch.prompt !== undefined ? patch.prompt : prompt,
      save_to: patch.save_to !== undefined ? patch.save_to : saveTo,
      modelo_gpt: patch.modelo_gpt !== undefined ? patch.modelo_gpt : modeloGpt,
      max_tokens: patch.max_tokens !== undefined ? patch.max_tokens : maxTokens,
      temperature: patch.temperature !== undefined ? patch.temperature : temperature,
      enviar_resultado_texto: patch.enviar_resultado_texto !== undefined ? patch.enviar_resultado_texto : enviarResultadoTexto,
      manter_contexto: patch.manter_contexto !== undefined ? patch.manter_contexto : manterContexto,
      leitura_imagem_pdf: patch.leitura_imagem_pdf !== undefined ? patch.leitura_imagem_pdf : leituraImagemPdf,
      ativar_personalidade: patch.ativar_personalidade !== undefined ? patch.ativar_personalidade : ativarPersonalidade,
      ativar_base_informacoes: patch.ativar_base_informacoes !== undefined ? patch.ativar_base_informacoes : ativarBaseInformacoes,
      ativar_restricoes: patch.ativar_restricoes !== undefined ? patch.ativar_restricoes : ativarRestricoes,
      salvar_em_campo: patch.salvar_em_campo !== undefined ? patch.salvar_em_campo : salvarEmCampo,
    };

    const parsed = aiGenericConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const insertVariable = (variableText: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextPrompt = prompt.substring(0, start) + variableText + prompt.substring(end);
    setPrompt(nextPrompt);
    commit({ prompt: nextPrompt });
    setIsVarsOpen(false);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableText.length, start + variableText.length);
    }, 0);
  };

  const handleCreateNewField = () => {
    const sanitizedKey = (newFieldKey || newFieldName)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+/, "");
    const finalKey = sanitizedKey || "campo_novo";
    const finalLabel = newFieldName || finalKey;

    const newField = { key: finalKey, label: finalLabel };
    setCustomFields((prev) => [newField, ...prev]);
    const nextSaveTo: ReplySaveTo = { kind: "lead_custom", key: finalKey };
    setSaveTo(nextSaveTo);
    setIsNewFieldOpen(false);
    setNewFieldName("");
    setNewFieldKey("");
    commit({ save_to: nextSaveTo, salvar_em_campo: true });
  };

  const currentModel: GptModelOption =
    (GPT_MODELS.find((m) => m.id === modeloGpt) ||
      GPT_MODELS.find((m) => m.name.toLowerCase() === modeloGpt.toLowerCase()) ||
      GPT_MODELS[0]) ?? {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      badge: "Econômico",
      badgeVariant: "green" as const,
      subtitle: "Menor custo, bom para respostas simples e frequentes.",
    };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* 1. Prompt de comando */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label
            htmlFor="gpt-prompt"
            className="block text-[12px] font-bold text-text"
          >
            {t("Prompt de comando")}
          </label>

          <Popover open={isVarsOpen} onOpenChange={setIsVarsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="text-[11.5px] font-semibold text-[#2563eb] hover:text-[#1d4ed8] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Eye size={13} />
                <span>{t("Campos Personalizados")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-2 space-y-1">
              <span className="text-[10px] font-bold text-text-subtle uppercase tracking-wider block px-2 py-1">
                {t("Inserir variável no cursor")}
              </span>
              <div className="space-y-0.5 max-h-56 overflow-y-auto">
                {VARIAVEIS_GPT.map((v) => (
                  <button
                    key={v.tag}
                    type="button"
                    onClick={() => insertVariable(v.tag)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-text-muted hover:bg-surface-elevated rounded-md transition-colors text-left cursor-pointer"
                  >
                    <span>{v.label}</span>
                    <code className="text-[10px] text-cat-blue bg-cat-blue-bg px-1 py-0.5 rounded-md font-mono">
                      {v.tag}
                    </code>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <textarea
          ref={textareaRef}
          id="gpt-prompt"
          rows={4}
          value={prompt}
          onChange={(e) => {
            setPrompt(e.target.value);
            commit({ prompt: e.target.value });
          }}
          placeholder={t("Digite aqui o prompt desejado.\n\nExemplo: Responda ao cliente de acordo as instruções.")}
          maxLength={2000}
          className="w-full rounded-[10px] border border-border bg-surface p-2.5 text-[13px] text-text placeholder:text-text-subtle focus:outline-hidden focus:border-cat-violet min-h-[105px] resize-y"
        />
      </div>

      {/* 2. Modelo GPT com badge */}
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
                      "bg-cat-green-bg text-cat-green border-cat-green/30",
                    currentModel.badgeVariant === "blue" &&
                      "bg-cat-blue-bg text-cat-blue border-cat-blue/30",
                    currentModel.badgeVariant === "amber" &&
                      "bg-cat-amber-bg text-cat-amber-fg border-cat-amber/30",
                    currentModel.badgeVariant === "purple" &&
                      "bg-cat-violet-bg text-cat-violet border-cat-violet/30"
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
                    ? "bg-cat-violet-bg border-cat-violet/30"
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
                        "bg-cat-green-bg text-cat-green border-cat-green/30",
                      m.badgeVariant === "blue" &&
                        "bg-cat-blue-bg text-cat-blue border-cat-blue/30",
                      m.badgeVariant === "amber" &&
                        "bg-cat-amber-bg text-cat-amber-fg border-cat-amber/30",
                      m.badgeVariant === "purple" &&
                        "bg-cat-violet-bg text-cat-violet border-cat-violet/30"
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

        <p className="text-[10.5px] text-text-subtle">
          {t("Novos blocos usam GPT-4o Mini por padrão. Seleções salvas continuam respeitadas.")}
        </p>
      </div>

      {/* 3. Sliders: Max Tokens e Temperature */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border border-border bg-surface p-3 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">
              {`Max Tokens (${maxTokens})`}
            </span>
          </div>
          <input
            type="range"
            min={64}
            max={4096}
            step={32}
            value={maxTokens}
            onChange={(e) => {
              const val = Number(e.target.value);
              setMaxTokens(val);
              commit({ max_tokens: val });
            }}
            className="w-full cursor-pointer accent-[#9333ea]"
          />
        </div>

        <div className="rounded-xl border border-border bg-surface p-3 space-y-2 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text">
              {`Temperature (${temperature})`}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => {
              const val = Number(e.target.value);
              setTemperature(val);
              commit({ temperature: val });
            }}
            className="w-full cursor-pointer accent-[#9333ea]"
          />
        </div>
      </div>

      {/* 4. 6 Toggles de recursos */}
      <div className="space-y-2">
        {/* Enviar resultado como texto? */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Enviar resultado como texto?")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enviarResultadoTexto}
            onClick={() => {
              const val = !enviarResultadoTexto;
              setEnviarResultadoTexto(val);
              commit({ enviar_resultado_texto: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              enviarResultadoTexto ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                enviarResultadoTexto ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Manter contexto? */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Manter contexto?")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={manterContexto}
            onClick={() => {
              const val = !manterContexto;
              setManterContexto(val);
              commit({ manter_contexto: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              manterContexto ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                manterContexto ? "translate-x-4" : "translate-x-0"
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

        {/* Ativar Personalidade */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Ativar Personalidade")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ativarPersonalidade}
            onClick={() => {
              const val = !ativarPersonalidade;
              setAtivarPersonalidade(val);
              commit({ ativar_personalidade: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              ativarPersonalidade ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                ativarPersonalidade ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Ativar Base de Informações */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Ativar Base de Informações")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ativarBaseInformacoes}
            onClick={() => {
              const val = !ativarBaseInformacoes;
              setAtivarBaseInformacoes(val);
              commit({ ativar_base_informacoes: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              ativarBaseInformacoes ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                ativarBaseInformacoes ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Ativar Restrições */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-surface">
          <span className="text-[12px] font-semibold text-text">
            {t("Ativar Restrições")}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ativarRestricoes}
            onClick={() => {
              const val = !ativarRestricoes;
              setAtivarRestricoes(val);
              commit({ ativar_restricoes: val });
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
              ativarRestricoes ? "bg-[#9333ea]" : "bg-border-strong"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-surface shadow-xs ring-0 transition duration-200 ease-in-out",
                ativarRestricoes ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {/* 5. Deseja salvar o retorno do GPT em um campo de fluxo? */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-bold text-text">
          {t("Deseja salvar o retorno do GPT em um campo de fluxo?")}
        </label>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={saveTo.kind === "lead_custom" ? saveTo.key : saveTo.kind}
              onChange={(e) => {
                const val = e.target.value;
                let next: ReplySaveTo;
                if (val === "contact_name") next = { kind: "contact_name" };
                else next = { kind: "lead_custom", key: val };
                setSaveTo(next);
                commit({ save_to: next, salvar_em_campo: true });
              }}
              className="w-full h-10 rounded-lg border border-border bg-surface px-3 pr-8 text-xs text-text-muted focus:outline-hidden appearance-none cursor-pointer"
            >
              <option value="resumo_ia">{t("Selecione um campo")}</option>
              <optgroup label={t("Contato")}>
                <option value="contact_name">{t("Nome do contato")}</option>
              </optgroup>
              <optgroup label={t("Campos Personalizados")}>
                {camposUnicos.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
                {customFields.map((cf) => (
                  <option key={cf.key} value={cf.key}>
                    {cf.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <ChevronDown
              size={15}
              className="absolute right-3 top-3 text-text-subtle pointer-events-none"
            />
          </div>

          <button
            type="button"
            onClick={() => setIsNewFieldOpen(true)}
            className="w-10 h-10 rounded-lg border border-border-strong bg-surface flex items-center justify-center text-text-muted hover:bg-surface-elevated transition-colors cursor-pointer shrink-0"
            title={t("Criar novo campo de fluxo")}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-cat-red font-medium">{error}</p>}

      {/* Modal Criar Novo Campo de Fluxo */}
      <Dialog open={isNewFieldOpen} onOpenChange={setIsNewFieldOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Criar novo campo de fluxo")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="gpt-field-name">{t("Nome do campo")}</Label>
              <Input
                id="gpt-field-name"
                placeholder="Ex: Resumo IA"
                value={newFieldName}
                onChange={(e) => {
                  setNewFieldName(e.target.value);
                  if (!newFieldKey) {
                    setNewFieldKey(
                      e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")
                    );
                  }
                }}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="gpt-field-key">{t("Chave da variável (slug)")}</Label>
              <Input
                id="gpt-field-key"
                placeholder="Ex: resumo_ia"
                value={newFieldKey}
                onChange={(e) =>
                  setNewFieldKey(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_")
                  )
                }
              />
              <p className="text-[10px] text-text-subtle">
                {t("Use letras minúsculas e sublinhados.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setIsNewFieldOpen(false)}
            >
              {t("Cancelar")}
            </Button>
            <Button
              type="button"
              onClick={handleCreateNewField}
              disabled={!newFieldName.trim() && !newFieldKey.trim()}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            >
              {t("Criar campo")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
