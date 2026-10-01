"use client";

import { useState } from "react";
import { addNoteConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { Note, Eye, Info } from "@/lib/ui/icons";
import type { ConfigOf } from "./shared";

const NOTE_VARS = [
  "{nome_completo}",
  "{primeiro_nome}",
  "{telefone}",
  "{email}",
  "{etapa_funil}",
  "{data_atual}",
];

export function AddNoteForm({
  config,
  onChange,
}: {
  config: ConfigOf<"add_note">;
  onChange: (c: ConfigOf<"add_note">) => void;
}) {
  const t = useT();
  const [body, setBody] = useState(config.body);
  const [showVars, setShowVars] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (value: string) => {
    setBody(value);
    const parsed = addNoteConfigSchema.safeParse({ body: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const insertVariable = (varName: string) => {
    const nextBody = body ? `${body} ${varName}` : varName;
    commit(nextBody);
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Header banner sofisticado */}
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600 text-white shadow-2xs">
          <Note size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("Anotação no Contato")}
          </h3>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {t("Registra nota interna no histórico da conversa (apenas equipe)")}
          </p>
        </div>
      </div>

      {/* Editor estilo Sticky Note */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="add-note-body" className="block text-[12px] font-semibold text-neutral-800 dark:text-neutral-200">
            {t("Conteúdo da nota interna")}
          </label>
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 cursor-pointer"
          >
            <Eye size={13} />
            <span>{t("Campos Personalizados")}</span>
          </button>
        </div>

        {/* Seletor de Variáveis */}
        {showVars && (
          <div className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/40 space-y-1.5">
            <span className="text-[11px] font-medium text-amber-900 dark:text-amber-300 block">
              {t("Inserir variável na nota:")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-0.5 rounded-md bg-white dark:bg-zinc-800 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-[11px] font-mono hover:bg-amber-100 cursor-pointer shadow-2xs"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative rounded-xl border border-amber-300 bg-amber-50/40 p-3 shadow-2xs dark:border-amber-800/80 dark:bg-amber-950/20">
          <textarea
            id="add-note-body"
            rows={5}
            maxLength={2000}
            value={body}
            onChange={(e) => commit(e.target.value)}
            placeholder={t("Documente contexto, decisões do fluxo, links ou observações importantes sobre este atendimento...")}
            className="w-full bg-transparent text-xs text-amber-950 dark:text-amber-100 placeholder:text-amber-600/50 dark:placeholder:text-amber-400/50 outline-hidden resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between border-t border-amber-200/80 pt-2 text-[10px] text-amber-700/80 dark:border-amber-900/60 dark:text-amber-400">
            <span className="flex items-center gap-1">
              <Info size={12} />
              {t("O contato nunca visualiza esta mensagem")}
            </span>
            <span className="font-mono">{body.length}/2000</span>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{error}</p>}
    </div>
  );
}
