"use client";

import { useState } from "react";
import { Sparkle, Clock, Plus, X, ChatCircle, ListChecks, Lightbulb } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { aiClassifyConfigSchema } from "@/lib/followup/graph-schema";
import {
  ALVOS_DA_CLASSIFICACAO,
  ESPERA_PELA_RESPOSTA,
  opcoes,
  type AlvoDaClassificacao,
} from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";

import { msToMin, minToMs, type ConfigOf } from "./shared";

const SUGESTOES_CLASSES = [
  "Interessado",
  "Sem interesse",
  "Dúvida",
  "Quente",
  "Frio",
  "Agendamento",
  "Reclamação",
];

const PRESETS_TEMPO = [
  { rotulo: "15 min", minutos: 15 },
  { rotulo: "30 min", minutos: 30 },
  { rotulo: "1h", minutos: 60 },
  { rotulo: "2h", minutos: 120 },
  { rotulo: "24h", minutos: 1440 },
];

/**
 * ⚠️ AS CLASSES AQUI USAM A SEMÂNTICA v1 DE PROPÓSITO — não é esquecimento.
 * O contrato do grafo já tem ramos nomeados (`branches`, id estável separado do rótulo).
 * Não mudar sem migrar arestas juntas.
 */
export function ClassifyForm({
  config,
  onChange,
}: {
  config: ConfigOf<"ai_classify">;
  onChange: (c: ConfigOf<"ai_classify">) => void;
}) {
  const t = useT();
  const [classesText, setClassesText] = useState(config.classes.join(", "));
  const [novaClasse, setNovaClasse] = useState("");
  const [graceMin, setGraceMin] = useState(msToMin(config.grace_timeout_ms));
  const [target, setTarget] = useState(config.target);
  const [hint, setHint] = useState(config.hint ?? "");
  const [error, setError] = useState<string | null>(null);

  const classesAtuais = classesText
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const commit = (next: { classesText: string; graceMin: number; target: AlvoDaClassificacao; hint: string }) => {
    const classes = next.classesText
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const candidate = {
      classes,
      grace_timeout_ms: minToMs(next.graceMin),
      target: next.target,
      ...(next.hint.trim() ? { hint: next.hint } : {}),
    };
    const parsed = aiClassifyConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const adicionarClasse = (classe: string) => {
    const limpa = classe.trim();
    if (!limpa) return;
    if (classesAtuais.some((c) => c.toLowerCase() === limpa.toLowerCase())) {
      setNovaClasse("");
      return;
    }
    const novoArray = [...classesAtuais, limpa];
    const novoTexto = novoArray.join(", ");
    setClassesText(novoTexto);
    setNovaClasse("");
    commit({ classesText: novoTexto, graceMin, target, hint });
  };

  const removerClasse = (index: number) => {
    const novoArray = classesAtuais.filter((_, i) => i !== index);
    const novoTexto = novoArray.join(", ");
    setClassesText(novoTexto);
    commit({ classesText: novoTexto, graceMin, target, hint });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Banner de Cabeçalho Visual */}
      <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-gradient-to-r from-violet-500/10 via-purple-500/5 to-transparent p-3 text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-200 shadow-2xs">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-[#7c3aed] to-[#a855f7] text-white shadow-md">
          <Sparkle size={20} weight="fill" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {t("Classificador IA")}
            </h3>
            <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
              {t("Inteligência Artificial")}
            </span>
          </div>
          <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Interpreta as respostas dos leads e ramifica as rotas automaticamente.")}
          </p>
        </div>
      </div>

      {/* Gerenciador Visual de Classes / Intenções */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex items-center justify-between">
          <Label htmlFor="classify-classes" className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {t("Rotas de Classificação")}
          </Label>
          <span className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
            {classesAtuais.length} {classesAtuais.length === 1 ? t("rota") : t("rotas")}
          </span>
        </div>

        {/* Badges das classes já cadastradas */}
        <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center p-1.5 rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          {classesAtuais.length === 0 ? (
            <span className="text-[11px] text-neutral-400 italic px-1">
              {t("Nenhuma classe configurada. Digite abaixo ou selecione uma sugestão.")}
            </span>
          ) : (
            classesAtuais.map((cls, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-800 shadow-2xs dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200"
              >
                <span>{cls}</span>
                <button
                  type="button"
                  onClick={() => removerClasse(idx)}
                  className="rounded-full p-0.5 text-violet-500 hover:bg-violet-200/60 hover:text-violet-900 dark:hover:bg-violet-800 dark:hover:text-violet-100 transition-colors cursor-pointer"
                  title={t("Remover classe")}
                >
                  <X size={12} />
                </button>
              </span>
            ))
          )}
        </div>

        {/* Campo para adicionar nova classe com botão */}
        <div className="flex items-center gap-2">
          <Input
            id="classify-classes"
            value={novaClasse}
            onChange={(e) => setNovaClasse(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                adicionarClasse(novaClasse);
              }
            }}
            placeholder={t("Nova classe (ex: Interessado, Dúvida...)")}
            className="h-8 text-xs bg-white dark:bg-neutral-950"
          />
          <button
            type="button"
            onClick={() => adicionarClasse(novaClasse)}
            disabled={!novaClasse.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-violet-600 px-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-violet-700 disabled:opacity-40 transition-colors cursor-pointer shrink-0"
          >
            <Plus size={14} />
            <span>{t("Adicionar")}</span>
          </button>
        </div>

        {/* Sugestões Rápidas de Classes */}
        <div className="pt-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            {t("Sugestões Rápidas:")}
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {SUGESTOES_CLASSES.map((sugestao) => {
              const jaExiste = classesAtuais.some((c) => c.toLowerCase() === sugestao.toLowerCase());
              return (
                <button
                  key={sugestao}
                  type="button"
                  disabled={jaExiste}
                  onClick={() => adicionarClasse(sugestao)}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors cursor-pointer",
                    jaExiste
                      ? "border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900"
                      : "border-neutral-300 bg-white text-neutral-700 hover:border-violet-400 hover:text-violet-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:border-violet-500"
                  )}
                >
                  + {sugestao}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Alvo da Leitura da IA */}
      <div className="space-y-2">
        <Label htmlFor="classify-target" className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
          {t("O que a IA vai analisar")}
        </Label>
        
        {/* Cards visuais de seleção de alvo */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setTarget("last_reply");
              commit({ classesText, graceMin, target: "last_reply", hint });
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all cursor-pointer shadow-2xs",
              target === "last_reply"
                ? "border-violet-600 bg-violet-50/70 dark:border-violet-500 dark:bg-violet-950/40 ring-1 ring-violet-600/30"
                : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
              <ChatCircle size={15} className="text-violet-600 dark:text-violet-400" />
              <span>{t("Última resposta")}</span>
            </div>
            <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400">
              {t("Lê estritamente o último texto recebido.")}
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setTarget("summary");
              commit({ classesText, graceMin, target: "summary", hint });
            }}
            className={cn(
              "flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-all cursor-pointer shadow-2xs",
              target === "summary"
                ? "border-violet-600 bg-violet-50/70 dark:border-violet-500 dark:bg-violet-950/40 ring-1 ring-violet-600/30"
                : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
              <ListChecks size={15} className="text-violet-600 dark:text-violet-400" />
              <span>{t("Resumo da conversa")}</span>
            </div>
            <p className="text-[10.5px] text-neutral-500 dark:text-neutral-400">
              {t("Analisa o contexto consolidado da conversa.")}
            </p>
          </button>
        </div>

        {/* Select original mantido para compatibilidade com testes */}
        <div className="hidden">
          <Select
            value={target}
            onValueChange={(v) => {
              const next = v as AlvoDaClassificacao;
              setTarget(next);
              commit({ classesText, graceMin, target: next, hint });
            }}
          >
            <SelectTrigger id="classify-target">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {opcoes(ALVOS_DA_CLASSIFICACAO).map(({ valor, rotulo }) => (
                <SelectItem key={valor} value={valor}>
                  {t(rotulo)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tempo Limite de Resposta */}
      <div className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 shadow-2xs">
        <div className="flex items-center justify-between">
          <Label htmlFor="classify-grace" className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            <Clock size={14} className="text-neutral-500" />
            <span>{t(ESPERA_PELA_RESPOSTA.rotulo)}</span>
          </Label>
          <span className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-300">
            {graceMin >= 60 ? `${(graceMin / 60).toFixed(1)}h` : `${graceMin} min`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Input
            id="classify-grace"
            type="number"
            min={ESPERA_PELA_RESPOSTA.minimoMinutos}
            value={graceMin}
            onChange={(e) => {
              const v = Number(e.target.value);
              setGraceMin(v);
              commit({ classesText, graceMin: v, target, hint });
            }}
            className="h-8 text-xs w-28 bg-white dark:bg-neutral-950"
          />
          <span className="text-xs text-neutral-500">{t("minutos")}</span>

          {/* Presets rápidos de tempo */}
          <div className="flex items-center gap-1 ml-auto">
            {PRESETS_TEMPO.map((p) => (
              <button
                key={p.rotulo}
                type="button"
                onClick={() => {
                  setGraceMin(p.minutos);
                  commit({ classesText, graceMin: p.minutos, target, hint });
                }}
                className={cn(
                  "rounded-md px-1.5 py-1 text-[10.5px] font-medium transition-colors cursor-pointer",
                  graceMin === p.minutos
                    ? "bg-violet-600 text-white"
                    : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300"
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-text-muted">{ESPERA_PELA_RESPOSTA.ajuda(t)}</p>
      </div>

      {/* Instruções Adicionais para IA (Prompt Hint) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="classify-hint" className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            <Lightbulb size={14} className="text-amber-500" />
            <span>{t("Orientação adicional para a IA (Opcional)")}</span>
          </Label>
          <span className="text-[10px] text-neutral-400">
            {hint.length}/500
          </span>
        </div>
        <Textarea
          id="classify-hint"
          maxLength={500}
          rows={3}
          value={hint}
          onChange={(e) => {
            setHint(e.target.value);
            commit({ classesText, graceMin, target, hint: e.target.value });
          }}
          placeholder={t(
            "Ex: Se o lead disser que já comprou com outra empresa, classifique como 'Sem interesse'. Se perguntar sobre preço ou planos, classifique como 'Dúvida'."
          )}
          className="text-xs resize-none bg-white dark:bg-neutral-950"
        />
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {t("Oriente como interpretar termos ambíguos ou gírias regionais.")}
        </p>
      </div>

      {error && <p className="text-xs font-medium text-error-fg">{error}</p>}
    </div>
  );
}
