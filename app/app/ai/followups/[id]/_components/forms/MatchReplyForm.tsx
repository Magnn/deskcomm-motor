"use client";

import { useState } from "react";
import { Eye, Plus, X, ChevronDown } from "lucide-react";

import {
  matchReplyConfigSchema,
  type IfExists,
  type MatchReplyBranch,
  type ReplySaveTo,
} from "@/lib/followup/graph-schema";
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

import type { ConfigOf } from "./shared";
import { minToMs, msToMin } from "./shared";
import { TemposELimitesCard } from "./TemposELimitesCard";

const CAMPOS_RAPIDOS = [
  { tag: "{{primeiro-nome}}", label: "Primeiro nome" },
  { tag: "{{nome}}", label: "Nome completo" },
  { tag: "{{telefone}}", label: "Número do WhatsApp" },
  { tag: "{{fluxo}}", label: "Nome do fluxo atual" },
  { tag: "{{email}}", label: "E-mail do contato" },
  { tag: "{{empresa}}", label: "Empresa / Organização" },
];

export function MatchReplyForm({
  config,
  onChange,
}: {
  config: ConfigOf<"match_reply">;
  onChange: (c: ConfigOf<"match_reply">) => void;
}) {
  const t = useT();
  const pipelines = usePipelines();
  const campos = (pipelines.data?.data ?? []).flatMap((p) =>
    camposDoFunil(p.settings)
  );
  const camposUnicos = [...new Map(campos.map((c) => [c.key, c])).values()];

  const [question, setQuestion] = useState(config.question ?? "");
  const [branches, setBranches] = useState<MatchReplyBranch[]>(config.branches);
  const [graceMin, setGraceMin] = useState(msToMin(config.grace_timeout_ms));
  const [saveTo, setSaveTo] = useState<ReplySaveTo | undefined>(config.save_to);
  const [ifExists, setIfExists] = useState<IfExists>(
    config.if_exists ?? "overwrite"
  );
  const [agruparSegundos, setAgruparSegundos] = useState<number>(
    config.agrupar_respostas_segundos ?? 15
  );
  const [expiracaoTempo, setExpiracaoTempo] = useState<number>(
    config.expiracao_tempo ?? 1
  );
  const [expiracaoUnidade, setExpiracaoUnidade] = useState<
    "segundos" | "minutos" | "horas" | "dias"
  >(config.expiracao_unidade ?? "horas");
  const [error, setError] = useState<string | null>(null);

  // Modal para criar novo campo de fluxo
  const [isNovoCampoOpen, setIsNovoCampoOpen] = useState(false);
  const [novoCampoNome, setNovoCampoNome] = useState("");
  const [camposLocais, setCamposLocais] = useState<string[]>([]);

  const commit = (patch: {
    question?: string;
    branches?: MatchReplyBranch[];
    graceMin?: number;
    saveTo?: ReplySaveTo | undefined;
    ifExists?: IfExists;
    agrupar_respostas_segundos?: number;
    expiracao_tempo?: number;
    expiracao_unidade?: "segundos" | "minutos" | "horas" | "dias";
  }) => {
    const candidate = {
      branches: patch.branches ?? branches,
      grace_timeout_ms: minToMs(patch.graceMin ?? graceMin),
      save_to: "saveTo" in patch ? patch.saveTo : saveTo,
      if_exists: patch.ifExists ?? ifExists,
      question: patch.question !== undefined ? patch.question : question,
      agrupar_respostas_segundos:
        patch.agrupar_respostas_segundos ?? agruparSegundos,
      expiracao_tempo: patch.expiracao_tempo ?? expiracaoTempo,
      expiracao_unidade: patch.expiracao_unidade ?? expiracaoUnidade,
    };

    const parsed = matchReplyConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const insertTag = (tag: string) => {
    const next = question ? `${question} ${tag}` : tag;
    setQuestion(next);
    commit({ question: next });
  };

  const handleCriarCampo = () => {
    const limpo = novoCampoNome.trim().replace(/[^a-zA-Z0-9_]/g, "_");
    if (!limpo) return;
    setCamposLocais((prev) => [...prev, limpo]);
    const novoSaveTo: ReplySaveTo = { kind: "lead_custom", key: limpo };
    setSaveTo(novoSaveTo);
    commit({ saveTo: novoSaveTo });
    setNovoCampoNome("");
    setIsNovoCampoOpen(false);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Texto de Ajuda AcassIA */}
      <div className="space-y-2 text-[11.5px] text-slate-500 dark:text-zinc-400 leading-relaxed text-justify">
        <p>
          {t(
            "Esse bloco possibilita uma conversa humanizada com perguntas e respostas. A pergunta será enviada ao contato e o fluxo ficará pausado até que o contato responda ou até que o bloco expire."
          )}
        </p>
        <p>
          <strong className="font-semibold text-slate-700 dark:text-zinc-300">
            {t("Dica importante:")}
          </strong>{" "}
          {t(
            'você pode inserir apenas um "espaço" no campo "Faça uma pergunta", a pausa será ativada e nenhum texto será enviado ao contato. Assim, você poderá enviar perguntas por áudio na seguinte estrutura: Bloco com áudio -> Bloco de pergunta configurado com "espaço".'
          )}
        </p>
      </div>

      {/* Divisor Configurar */}
      <div className="relative flex items-center justify-center my-3">
        <div className="w-full border-t border-slate-200 dark:border-zinc-800" />
        <span className="absolute bg-white dark:bg-zinc-950 px-3 text-[11px] text-slate-400 dark:text-zinc-500 font-medium">
          {t("Configurar")}
        </span>
      </div>

      {/* Seção Faça uma pergunta */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="match-reply-question"
            className="text-[12px] font-semibold text-slate-800 dark:text-zinc-200"
          >
            {t("Faça uma pergunta:")}
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Eye size={13} className="text-blue-600 dark:text-blue-400" />
                <span>{t("Campos Personalizados")}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-56 p-2 space-y-1 text-xs bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-md rounded-xl"
            >
              <p className="px-2 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                {t("Inserir variável")}
              </p>
              {CAMPOS_RAPIDOS.map((campo) => (
                <button
                  key={campo.tag}
                  type="button"
                  onClick={() => insertTag(campo.tag)}
                  className="w-full text-left px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-zinc-800 font-mono text-[11px] text-slate-700 dark:text-zinc-200 flex items-center justify-between cursor-pointer"
                >
                  <span>{campo.tag}</span>
                  <span className="text-[10px] font-sans text-slate-400">
                    {campo.label}
                  </span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </div>

        <textarea
          id="match-reply-question"
          rows={4}
          maxLength={1000}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            commit({ question: e.target.value });
          }}
          placeholder={t("Ex: Qual o seu nome?")}
          className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[12px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 shadow-2xs resize-none"
        />
      </div>

      {/* Salvar resposta em um campo de fluxo (opcional) */}
      <div className="space-y-1.5 pt-1">
        <label className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Salvar resposta em um campo de fluxo (opcional)")}
        </label>
        <div className="flex items-center gap-2">
          {saveTo ? (
            <div className="flex-1 h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 flex items-center justify-between shadow-2xs">
              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-700 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2 py-1 rounded-md">
                &#123;&#123;
                {saveTo.kind === "lead_custom"
                  ? saveTo.key
                  : "nome_do_contato"}
                &#125;&#125;
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Texto</span>
                <button
                  type="button"
                  onClick={() => {
                    setSaveTo(undefined);
                    commit({ saveTo: undefined });
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative flex-1">
              <select
                value=""
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) return;
                  const novo: ReplySaveTo =
                    val === "contact_name"
                      ? { kind: "contact_name" }
                      : { kind: "lead_custom", key: val.replace("custom:", "") };
                  setSaveTo(novo);
                  commit({ saveTo: novo });
                }}
                className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 pr-8 text-xs text-slate-700 dark:text-zinc-200 focus:outline-hidden appearance-none cursor-pointer"
              >
                <option value="">{t("Selecione um campo")}</option>
                <optgroup label={t("Padrão")}>
                  <option value="contact_name">{t("Nome do contato")}</option>
                </optgroup>
                <optgroup label={t("Campos do Funil")}>
                  {camposUnicos.map((campo) => (
                    <option key={campo.key} value={`custom:${campo.key}`}>
                      {campo.label}
                    </option>
                  ))}
                </optgroup>
                {camposLocais.length > 0 && (
                  <optgroup label={t("Campos Criados")}>
                    {camposLocais.map((c) => (
                      <option key={c} value={`custom:${c}`}>
                        {c}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <ChevronDown
                size={15}
                className="absolute right-3 top-3 text-slate-400 pointer-events-none"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsNovoCampoOpen(true)}
            className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-center text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 shadow-2xs cursor-pointer"
            title={t("Criar novo campo de fluxo")}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* Modal Criar Novo Campo de Fluxo */}
      <Dialog open={isNovoCampoOpen} onOpenChange={setIsNovoCampoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold text-slate-800 dark:text-zinc-100">
              {t("Criar novo campo de fluxo")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-xs">
            <p className="text-slate-500">
              {t("Digite o identificador do campo para salvar a resposta:")}
            </p>
            <input
              type="text"
              placeholder="ex: cidade_lead"
              value={novoCampoNome}
              onChange={(e) => setNovoCampoNome(e.target.value)}
              className="w-full h-10 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs text-slate-800 dark:text-zinc-100 focus:outline-hidden"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setIsNovoCampoOpen(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={handleCriarCampo}
              className="px-3 py-1.5 rounded-lg text-xs bg-[#70b300] hover:bg-[#629c00] text-white font-semibold cursor-pointer"
            >
              {t("Criar e selecionar")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Seção Tempos e limites (2 cards) */}
      <TemposELimitesCard
        agruparSegundos={agruparSegundos}
        onAgruparChange={(val) => {
          setAgruparSegundos(val);
          commit({ agrupar_respostas_segundos: val });
        }}
        expiracaoTempo={expiracaoTempo}
        onExpiracaoTempoChange={(val) => {
          setExpiracaoTempo(val);
          commit({ expiracao_tempo: val });
        }}
        expiracaoUnidade={expiracaoUnidade}
        onExpiracaoUnidadeChange={(val) => {
          setExpiracaoUnidade(val);
          commit({ expiracao_unidade: val });
        }}
      />

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
