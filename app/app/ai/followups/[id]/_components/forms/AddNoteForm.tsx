"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addNoteConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * Anotação no contato — 1 campo de texto. Reaproveita `conversation_notes`
 * (a mesma nota que um humano cria pela Inbox — nunca vai ao WhatsApp).
 */
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
    <div className="space-y-2">
      <Label htmlFor="add-note-body">{t("Texto da nota")}</Label>
      <Textarea id="add-note-body" maxLength={2000} value={body} onChange={(e) => commit(e.target.value)} />
      <p className="text-xs text-text-muted">
        {t("Fica registrada na conversa, como uma nota interna — o contato nunca recebe mensagem nenhuma.")}
      </p>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
