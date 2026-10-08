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
      <div className="flex items-center gap-2.5 rounded-lg border border-cat-amber/30 bg-cat-amber-bg p-3 text-cat-amber-fg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cat-amber text-white shadow-2xs">
          <Note size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text">
            {t("Anotação no Contato")}
          </h3>
          <p className="text-[11px] text-text-muted">
            {t("Registra nota interna no histórico da conversa (apenas equipe)")}
          </p>
        </div>
      </div>

      {/* Editor estilo Sticky Note */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="add-note-body" className="block text-[12px] font-semibold text-text">
            {t("Conteúdo da nota interna")}
          </label>
          <button
            type="button"
            onClick={() => setShowVars(!showVars)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-cat-amber-fg hover:text-cat-amber-fg cursor-pointer"
          >
            <Eye size={13} />
            <span>{t("Campos Personalizados")}</span>
          </button>
        </div>

        {/* Seletor de Variáveis */}
        {showVars && (
          <div className="p-2.5 rounded-lg border border-cat-amber/30 bg-cat-amber-bg space-y-1.5">
            <span className="text-[11px] font-medium text-cat-amber-fg block">
              {t("Inserir variável na nota:")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_VARS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="px-2 py-0.5 rounded-md bg-surface text-cat-amber-fg border border-cat-amber/30 text-[11px] font-mono hover:bg-cat-amber-bg cursor-pointer shadow-2xs"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative rounded-xl border border-cat-amber/30 bg-cat-amber-bg p-3 shadow-2xs">
          <textarea
            id="add-note-body"
            rows={5}
            maxLength={2000}
            value={body}
            onChange={(e) => commit(e.target.value)}
            placeholder={t("Documente contexto, decisões do fluxo, links ou observações importantes sobre este atendimento...")}
            className="w-full bg-transparent text-xs text-cat-amber-fg placeholder:text-cat-amber outline-hidden resize-none leading-relaxed"
          />
          <div className="flex items-center justify-between border-t border-cat-amber/30 pt-2 text-[10px] text-cat-amber-fg">
            <span className="flex items-center gap-1">
              <Info size={12} />
              {t("O contato nunca visualiza esta mensagem")}
            </span>
            <span className="font-mono">{body.length}/2000</span>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-cat-red font-medium">{error}</p>}
    </div>
  );
}
