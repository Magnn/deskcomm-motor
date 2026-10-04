"use client";

import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types/messaging";

/**
 * O que foi DITO no áudio, para quem atende ler sem dar o play.
 *
 * O texto já existe: é o mesmo que o agente de IA lê (`messages.media_derived_text`,
 * gravado pelo `media-derive-worker`). Só aparece quando a transcrição terminou
 * bem — em `failed` a coluna guarda um marcador escrito para o agente, não para
 * a tela, e mostrá-lo passaria por fala do cliente.
 *
 * Fechada por padrão: a conversa continua com a cara de sempre, e quem quer ler
 * abre.
 */
export function transcricaoDoAudio(message: Pick<Message, "type" | "media_derived_status" | "media_derived_text">): string | null {
  if (message.type !== "audio" || message.media_derived_status !== "ready") return null;
  const texto = (message.media_derived_text ?? "").trim();
  return texto === "" ? null : texto;
}

export function TranscricaoDoAudio({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  const t = useT();
  const [aberta, setAberta] = useState(false);
  const texto = transcricaoDoAudio(message);
  if (texto === null) return null;

  const idDoTexto = `transcricao-${message.id}`;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idDoTexto}
        onClick={() => setAberta((v) => !v)}
        className={cn(
          "text-xs underline underline-offset-2 opacity-80 hover:opacity-100 focus-visible:opacity-100",
          isOutbound ? "text-primary-foreground" : "text-foreground",
        )}
      >
        {aberta ? t("Ocultar transcrição") : t("Ver transcrição")}
      </button>
      {aberta && (
        <p id={idDoTexto} className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm leading-snug">
          {texto}
        </p>
      )}
    </div>
  );
}
