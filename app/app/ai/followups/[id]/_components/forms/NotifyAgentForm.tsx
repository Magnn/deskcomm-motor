"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notifyAgentConfigSchema } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";

import type { ConfigOf } from "./shared";

/**
 * Notificar atendente humano — 1 campo, a mensagem do aviso. Reaproveita a
 * Central de avisos (`agent_inbox_items`) que o resto do produto já usa, sem
 * transferir a conversa: o atendimento continua com o fluxo/agente.
 */
export function NotifyAgentForm({
  config,
  onChange,
}: {
  config: ConfigOf<"notify_agent">;
  onChange: (c: ConfigOf<"notify_agent">) => void;
}) {
  const t = useT();
  const [message, setMessage] = useState(config.message);
  const [error, setError] = useState<string | null>(null);

  const commit = (value: string) => {
    setMessage(value);
    const parsed = notifyAgentConfigSchema.safeParse({ message: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="notify-agent-message">{t("Mensagem do aviso")}</Label>
      <Textarea
        id="notify-agent-message"
        maxLength={500}
        value={message}
        onChange={(e) => commit(e.target.value)}
      />
      <p className="text-xs text-text-muted">
        {t("Abre um item na Central de avisos, apontando para este atendimento — ninguém assume a conversa por você.")}
      </p>
      {error && <p className="text-xs text-error-fg">{error}</p>}
    </div>
  );
}
