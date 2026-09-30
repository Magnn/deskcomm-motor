"use client";

import { useState } from "react";

import { addNoteConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

export function AddNoteForm({
  config,
  onChange,
}: {
  config: ConfigOf<"add_note">;
  onChange: (c: ConfigOf<"add_note">) => void;
}) {
  const t = useT();
  const [body, setBody] = useState(config.body);
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

  return (
    <div className="space-y-4 font-sans text-xs">
      <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        {t(
          "Gera uma anotação interna no histórico do atendimento. Fica visível apenas para os atendentes humanos no CRM — o contato nunca recebe nada."
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
        <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">
          {t("Anotação")}
        </span>
        <div className="h-px flex-1 bg-slate-200 dark:bg-zinc-800" />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="add-note-body" className="block text-[12px] font-semibold text-slate-800 dark:text-zinc-200">
          {t("Conteúdo da nota interna")}
        </label>
        <textarea
          id="add-note-body"
          rows={6}
          maxLength={2000}
          value={body}
          onChange={(e) => commit(e.target.value)}
          placeholder={t("Documente decisões, links, contexto ou observações importantes sobre este ponto...")}
          className="w-full rounded-[10px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 text-[13px] text-slate-700 dark:text-zinc-100 placeholder:text-slate-400 outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 shadow-xs resize-none"
        />
      </div>

      {error && <p className="text-xs text-error-fg font-medium">{error}</p>}
    </div>
  );
}
