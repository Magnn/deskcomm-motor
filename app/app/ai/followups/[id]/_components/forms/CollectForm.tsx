"use client";

import { useState, useRef } from "react";
import { Eye, HelpCircle, ChevronDown, Plus, X } from "lucide-react";
import {
  collectConfigSchema,
  type ContactFlowFieldType,
} from "@/lib/followup/graph-schema";
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

const VARIAVEIS_PADRAO = [
  { tag: "{{primeiro_nome}}", label: "Primeiro Nome" },
  { tag: "{{nome}}", label: "Nome Completo" },
  { tag: "{{telefone}}", label: "Telefone" },
  { tag: "{{email}}", label: "E-mail" },
  { tag: "{{saudacao}}", label: "Saudação" },
  { tag: "{{etapa}}", label: "Etapa Atual" },
  { tag: "{{resposta_anterior}}", label: "Resposta Anterior" },
];

const TIPOS_DE_DADO: Array<{ value: ContactFlowFieldType; label: string }> = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Data" },
  { value: "boolean", label: "Sim/Não" },
  { value: "select", label: "Seleção" },
  { value: "cpf", label: "CPF" },
];

export function CollectForm({
  config,
  onChange,
}: {
  config: ConfigOf<"collect">;
  onChange: (c: ConfigOf<"collect">) => void;
}) {
  const t = useT();

  const [question, setQuestion] = useState(config.question ?? config.label ?? "");
  const [salvarEmCampo, setSalvarEmCampo] = useState(
    config.salvar_resposta_campo !== false && Boolean(config.key)
  );

  // Campos de fluxo disponíveis para armazenamento
  const [availableFields, setAvailableFields] = useState<
    Array<{ key: string; label: string; type: ContactFlowFieldType }>
  >(() => {
    const defaults = [
      { key: "peso_altura_lead", label: "PesoAltura_Lead", type: "text" as ContactFlowFieldType },
      { key: "cidade_lead", label: "Cidade_Lead", type: "text" as ContactFlowFieldType },
      { key: "idade_lead", label: "Idade_Lead", type: "number" as ContactFlowFieldType },
      { key: "cpf_cliente", label: "CPF_Cliente", type: "cpf" as ContactFlowFieldType },
      { key: "resposta_pergunta", label: "Resposta_Pergunta", type: "text" as ContactFlowFieldType },
    ];
    if (config.key && !defaults.some((d) => d.key === config.key)) {
      defaults.unshift({
        key: config.key,
        label: config.label || config.key,
        type: config.type || "text",
      });
    }
    return defaults;
  });

  const [selectedKey, setSelectedKey] = useState(
    config.key || availableFields[0]?.key || "resposta"
  );
  const [selectedLabel, setSelectedLabel] = useState(
    config.label || availableFields[0]?.label || "Resposta"
  );
  const [selectedType, setSelectedType] = useState<ContactFlowFieldType>(
    config.type || "text"
  );

  // Tempos e limites
  const [agruparSegundos, setAgruparSegundos] = useState(
    config.agrupar_respostas_segundos ?? 15
  );
  const [expiracaoTempo, setExpiracaoTempo] = useState(
    config.expiracao_tempo ?? 9
  );
  const [expiracaoUnidade, setExpiracaoUnidade] = useState<
    "segundos" | "minutos" | "horas" | "dias"
  >(config.expiracao_unidade ?? "minutos");

  // Diálogo para criar novo campo de fluxo
  const [isNewFieldOpen, setIsNewFieldOpen] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldKey, setNewFieldKey] = useState("");
  const [newFieldType, setNewFieldType] = useState<ContactFlowFieldType>("text");

  const [isFieldSelectOpen, setIsFieldSelectOpen] = useState(false);
  const [isVarsOpen, setIsVarsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commit = (patch: Partial<ConfigOf<"collect">>) => {
    const candidate = {
      key: patch.key !== undefined ? patch.key : (salvarEmCampo ? selectedKey : (config.key || "resposta")),
      label: patch.label !== undefined ? patch.label : (salvarEmCampo ? selectedLabel : (config.label || "Resposta")),
      type: patch.type !== undefined ? patch.type : selectedType,
      required: patch.required !== undefined ? patch.required : (config.required ?? true),
      permite_correcao: patch.permite_correcao !== undefined ? patch.permite_correcao : (config.permite_correcao ?? true),
      options: patch.options !== undefined ? patch.options : config.options,
      question: patch.question !== undefined ? patch.question : question,
      agrupar_respostas_segundos: patch.agrupar_respostas_segundos !== undefined ? patch.agrupar_respostas_segundos : agruparSegundos,
      expiracao_tempo: patch.expiracao_tempo !== undefined ? patch.expiracao_tempo : expiracaoTempo,
      expiracao_unidade: patch.expiracao_unidade !== undefined ? patch.expiracao_unidade : expiracaoUnidade,
      salvar_resposta_campo: patch.salvar_resposta_campo !== undefined ? patch.salvar_resposta_campo : salvarEmCampo,
    };

    const parsed = collectConfigSchema.safeParse(candidate);
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
    const nextQuestion = question.substring(0, start) + variableText + question.substring(end);
    setQuestion(nextQuestion);
    commit({ question: nextQuestion });
    setIsVarsOpen(false);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variableText.length, start + variableText.length);
    }, 0);
  };

  const handleSelectField = (field: { key: string; label: string; type: ContactFlowFieldType }) => {
    setSelectedKey(field.key);
    setSelectedLabel(field.label);
    setSelectedType(field.type);
    setSalvarEmCampo(true);
    setIsFieldSelectOpen(false);
    commit({
      key: field.key,
      label: field.label,
      type: field.type,
      salvar_resposta_campo: true,
    });
  };

  const handleClearField = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSalvarEmCampo(false);
    commit({ salvar_resposta_campo: false });
  };

  const handleCreateNewField = () => {
    const sanitizedKey = (newFieldKey || newFieldName)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/^_+/, "");
    const finalKey = sanitizedKey || "campo_novo";
    const finalLabel = newFieldName || finalKey;

    const newField = {
      key: finalKey,
      label: finalLabel,
      type: newFieldType,
    };

    setAvailableFields((prev) => [newField, ...prev]);
    setSelectedKey(newField.key);
    setSelectedLabel(newField.label);
    setSelectedType(newField.type);
    setSalvarEmCampo(true);
    setIsNewFieldOpen(false);
    setNewFieldName("");
    setNewFieldKey("");
    setNewFieldType("text");

    commit({
      key: newField.key,
      label: newField.label,
      type: newField.type,
      salvar_resposta_campo: true,
    });
  };

  const currentFieldLabel = availableFields.find((f) => f.key === selectedKey)?.label || selectedLabel;
  const currentFieldTypeLabel = TIPOS_DE_DADO.find((t) => t.value === selectedType)?.label || "Texto";

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Texto introdutório e dica importante (estilo AcassIA) */}
      <div className="space-y-2 text-text-muted text-[11.5px] leading-relaxed">
        <p>
          {t(
            "Esse bloco possibilita uma conversa humanizada com perguntas e respostas. A pergunta será enviada ao contato e o fluxo ficará pausado até que o contato responda ou até que o bloco expire."
          )}
        </p>
        <p>
          <strong className="font-semibold text-text-muted">
            {t("Dica importante:")}
          </strong>{" "}
          {t(
            'você pode inserir apenas um "espaço" no campo "Faça uma pergunta", a pausa será ativada e nenhum texto será enviado ao contato. Assim, você poderá enviar perguntas por áudio na seguinte estrutura: Bloco com áudio -> Bloco de pergunta configurado com "espaço".'
          )}
        </p>
      </div>

      {/* Divisor: Configurar */}
      <div className="flex items-center gap-3 my-2">
        <div className="h-px flex-1 bg-surface-elevated" />
        <span className="text-[11px] font-medium text-text-subtle">
          {t("Configurar")}
        </span>
        <div className="h-px flex-1 bg-surface-elevated" />
      </div>

      {/* 1. Faça uma pergunta: */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <label
            htmlFor="collect-question"
            className="block text-[12px] font-bold text-text"
          >
            {t("Faça uma pergunta:")}
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
                {VARIAVEIS_PADRAO.map((v) => (
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
                {availableFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => insertVariable(`{{${f.label}}}`)}
                    className="w-full flex items-center justify-between px-2 py-1.5 text-xs text-text-muted hover:bg-surface-elevated rounded-md transition-colors text-left cursor-pointer"
                  >
                    <span>{f.label}</span>
                    <code className="text-[10px] text-cat-violet bg-cat-violet-bg px-1 py-0.5 rounded-md font-mono">
                      {`{{${f.label}}}`}
                    </code>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <textarea
          ref={textareaRef}
          id="collect-question"
          rows={4}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            commit({ question: e.target.value });
          }}
          placeholder={t("Faça uma pergunta...")}
          maxLength={400}
          className="w-full rounded-[10px] border border-[#2563eb] bg-surface p-2.5 text-[13px] text-text placeholder:text-text-subtle focus:outline-hidden focus:ring-1 focus:ring-[#2563eb] min-h-[105px] resize-y"
        />
      </div>

      {/* 2. Salvar resposta em um campo de fluxo (opcional) */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-bold text-text">
          {t("Salvar resposta em um campo de fluxo (opcional)")}
        </label>

        <div className="flex items-center gap-2">
          {/* Seletor do campo */}
          <Popover open={isFieldSelectOpen} onOpenChange={setIsFieldSelectOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex-1 flex items-center justify-between rounded-lg border border-border bg-surface px-2.5 py-1.5 h-10 text-xs transition-colors hover:border-border-strong cursor-pointer text-left"
              >
                {salvarEmCampo ? (
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="rounded-md bg-surface-elevated px-2 py-0.5 text-[11px] font-mono text-text-muted border border-border truncate">
                      {`{{${currentFieldLabel}}}`}
                    </span>
                  </div>
                ) : (
                  <span className="text-text-subtle text-xs">
                    {t("Nenhum campo selecionado")}
                  </span>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  {salvarEmCampo && (
                    <>
                      <span className="text-[11px] text-text-muted">
                        {currentFieldTypeLabel}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={handleClearField}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleClearField(e as unknown as React.MouseEvent);
                          }
                        }}
                        className="p-0.5 rounded-md hover:bg-surface-elevated text-text-subtle hover:text-text-muted cursor-pointer"
                        title={t("Remover campo")}
                      >
                        <X size={13} />
                      </span>
                    </>
                  )}
                  <ChevronDown size={14} className="text-text-subtle" />
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2 space-y-1">
              <span className="text-[10px] font-bold text-text-subtle uppercase tracking-wider block px-2 py-1">
                {t("Selecionar campo de fluxo")}
              </span>
              <div className="space-y-0.5 max-h-56 overflow-y-auto">
                {availableFields.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => handleSelectField(f)}
                    className={cn(
                      "w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-md transition-colors text-left cursor-pointer",
                      selectedKey === f.key && salvarEmCampo
                        ? "bg-cat-blue-bg text-cat-blue-fg font-semibold"
                        : "hover:bg-surface-elevated text-text-muted"
                    )}
                  >
                    <span className="font-mono text-[11px]">{`{{${f.label}}}`}</span>
                    <span className="text-[10px] text-text-subtle">
                      {TIPOS_DE_DADO.find((td) => td.value === f.type)?.label || f.type}
                    </span>
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Botão + para adicionar novo campo */}
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

      {/* Divisor: Tempos e limites */}
      <div className="flex items-center gap-3 my-2">
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
            <span className="rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] px-2 py-0.5 text-[10px] font-medium">
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
            <span className="rounded-full bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] px-2 py-0.5 text-[10px] font-medium">
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
            <option value="minutos">{t("Minutos")}</option>
            <option value="horas">{t("Horas")}</option>
            <option value="dias">{t("Dias")}</option>
            <option value="segundos">{t("Segundos")}</option>
          </select>
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
              <Label htmlFor="new-field-name">{t("Nome do campo")}</Label>
              <Input
                id="new-field-name"
                placeholder="Ex: Peso e Altura"
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
              <Label htmlFor="new-field-key">{t("Chave da variável (slug)")}</Label>
              <Input
                id="new-field-key"
                placeholder="Ex: peso_altura_lead"
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

            <div className="space-y-1">
              <Label htmlFor="new-field-type">{t("Tipo do dado")}</Label>
              <select
                id="new-field-type"
                value={newFieldType}
                onChange={(e) =>
                  setNewFieldType(e.target.value as ContactFlowFieldType)
                }
                className="w-full h-10 rounded-md border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden"
              >
                {TIPOS_DE_DADO.map((td) => (
                  <option key={td.value} value={td.value}>
                    {td.label}
                  </option>
                ))}
              </select>
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
