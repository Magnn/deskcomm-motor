"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { menuConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";
import { minToMs, msToMin } from "./shared";
import { TemposELimitesCard } from "./TemposELimitesCard";

type MenuOption = ConfigOf<"menu">["options"][number];

function novoId(usados: ReadonlySet<string>): string {
  for (let numero = 1; ; numero++) {
    const candidato = `opcao_${numero}`;
    if (!usados.has(candidato)) return candidato;
  }
}

export function MenuForm({
  config,
  onChange,
}: {
  config: ConfigOf<"menu">;
  onChange: (config: ConfigOf<"menu">) => void;
}) {
  const t = useT();
  const [prompt, setPrompt] = useState(
    config.prompt || t("Selecione uma das opções:")
  );
  const [options, setOptions] = useState<MenuOption[]>(config.options);
  const [graceMin, setGraceMin] = useState(msToMin(config.grace_timeout_ms));
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

  const commit = (patch: {
    prompt?: string;
    options?: MenuOption[];
    graceMin?: number;
    agrupar_respostas_segundos?: number;
    expiracao_tempo?: number;
    expiracao_unidade?: "segundos" | "minutos" | "horas" | "dias";
  }) => {
    const nextPrompt = patch.prompt ?? prompt;
    const nextOptions = patch.options ?? options;
    const nextGraceMin = patch.graceMin ?? graceMin;
    const nextAgrupar =
      patch.agrupar_respostas_segundos ?? agruparSegundos;
    const nextExpTempo = patch.expiracao_tempo ?? expiracaoTempo;
    const nextExpUnid = patch.expiracao_unidade ?? expiracaoUnidade;

    const parsed = menuConfigSchema.safeParse({
      prompt: nextPrompt,
      options: nextOptions,
      grace_timeout_ms: minToMs(nextGraceMin),
      agrupar_respostas_segundos: nextAgrupar,
      expiracao_tempo: nextExpTempo,
      expiracao_unidade: nextExpUnid,
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const atualizarOpcao = (index: number, label: string) => {
    const next = options.map((option, current) =>
      current === index ? { ...option, label } : option
    );
    setOptions(next);
    commit({ options: next });
  };

  const adicionarOpcao = () => {
    if (options.length >= 8) return;
    const usados = new Set(options.map((option) => option.id));
    const next = [
      ...options,
      { id: novoId(usados), label: `${t("Opção")} ${options.length + 1}` },
    ];
    setOptions(next);
    commit({ options: next });
  };

  const removerOpcao = (index: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, current) => current !== index);
    setOptions(next);
    commit({ options: next });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Texto descritivo superior AcassIA */}
      <p className="text-[11.5px] text-text-muted leading-relaxed text-justify">
        {t("Apresente opções para o contato escolher um caminho na conversa.")}
      </p>

      {/* Divisor: Configurar Título */}
      <div className="relative flex items-center justify-center my-3">
        <div className="w-full border-t border-border" />
        <span className="absolute bg-surface px-3 text-[11px] text-text-subtle font-medium">
          {t("Configurar Título")}
        </span>
      </div>

      {/* Mensagem de texto */}
      <div className="space-y-1.5">
        <label
          htmlFor="menu-prompt"
          className="block text-[12px] font-semibold text-text"
        >
          {t("Mensagem de texto")}
        </label>
        <input
          id="menu-prompt"
          type="text"
          maxLength={1000}
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            commit({ prompt: event.target.value });
          }}
          placeholder={t("Selecione uma das opções:")}
          className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted placeholder:text-text-subtle focus:outline-hidden focus:border-cat-violet shadow-2xs"
        />
      </div>

      {/* Divisor com Botão Central: + Adicionar Opção */}
      <div className="relative flex items-center justify-center my-4">
        <div className="w-full border-t border-border" />
        <button
          type="button"
          disabled={options.length >= 8}
          onClick={adicionarOpcao}
          className="absolute bg-surface border border-border rounded-full px-4 py-1 text-[11.5px] font-semibold text-text-muted hover:bg-surface-elevated flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Plus size={13} className="text-text-subtle" />
          <span>{t("Adicionar Opção")}</span>
        </button>
      </div>

      {/* Cards de Opções */}
      <div className="space-y-3 pt-1">
        {options.map((option, index) => (
          <div
            key={option.id}
            className="rounded-xl border border-border bg-surface shadow-2xs overflow-hidden"
          >
            {/* Input da Opção */}
            <div className="p-2.5">
              <input
                aria-label={`${t("Opção")} ${index + 1}`}
                maxLength={40}
                value={option.label}
                onChange={(event) => atualizarOpcao(index, event.target.value)}
                placeholder={t("Nova opção")}
                className="w-full h-9 rounded-lg border border-border bg-surface px-3 text-xs text-text focus:outline-hidden focus:border-cat-violet"
              />
            </div>

            {/* Linha divisória fina */}
            <div className="border-t border-border" />

            {/* Rodapé: Opção X + Lixeira */}
            <div className="px-3 py-2 flex items-center justify-between bg-surface">
              <span className="text-[11.5px] font-medium text-cat-blue">
                {t("Opção")} {index + 1}
              </span>
              <button
                type="button"
                aria-label={`${t("Remover opção")} ${index + 1}`}
                disabled={options.length <= 2}
                onClick={() => removerOpcao(index)}
                className="text-cat-red hover:text-cat-red transition-colors p-1 disabled:opacity-30 cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

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

      {/* Nota explicativa de rodapé AcassIA */}
      <p className="text-[11px] text-text-subtle pt-1 leading-relaxed">
        {t(
          "Conecte as saídas negativas no fluxograma: resposta incorreta e expiração do bloco."
        )}
      </p>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
