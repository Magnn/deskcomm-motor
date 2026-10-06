"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types/messaging";

/**
 * O que foi DITO no áudio, para quem atende ler sem dar o play — e, quando a transcrição não saiu, o
 * balão DIZ que não saiu.
 *
 * O texto é o mesmo que o agente de IA lê (`messages.media_derived_text`, gravado pelo
 * `media-derive-worker`). Três estados, e nenhum é silêncio:
 *
 *   - `pronta`      — o texto aparece direto embaixo do áudio, sem clique. Texto longo abre em "Ver tudo".
 *   - `falhou`      — "Não foi possível transcrever este áudio" + "Tentar de novo". Em `failed` a coluna
 *                     guarda um marcador escrito para o agente, não para a tela: ele não é mostrado.
 *   - `em_andamento`— áudio RECEBIDO há pouco, com o arquivo guardado e sem resultado ainda.
 *
 * Por que a falha precisa aparecer: medido em produção em 06/10/2026, 22 de 24 áudios recebidos tinham
 * falhado (o serviço de transcrição estava sem crédito) e o chat mostrava só o tocador — idêntico a um
 * áudio que nunca seria transcrito. Ninguém viu, e a IA respondia sem ter ouvido.
 */
export type EstadoDaTranscricao =
  | { estado: "pronta"; texto: string }
  | { estado: "falhou" }
  | { estado: "em_andamento" }
  | { estado: "nada" };

/** Por quanto tempo um áudio sem resultado ainda é "transcrevendo" (o worker desiste bem antes disso). */
const JANELA_DE_ANDAMENTO_MS = 10 * 60 * 1000;

type CamposDaMensagem = Pick<
  Message,
  "type" | "direction" | "media_derived_status" | "media_derived_text" | "media_storage_path" | "created_at"
>;

export function estadoDaTranscricao(message: CamposDaMensagem, agora: number = Date.now()): EstadoDaTranscricao {
  if (message.type !== "audio") return { estado: "nada" };
  if (message.media_derived_status === "ready") {
    const texto = (message.media_derived_text ?? "").trim();
    return texto === "" ? { estado: "nada" } : { estado: "pronta", texto };
  }
  // Só o áudio RECEBIDO é transcrito para o atendimento; o que a casa enviou já tem o texto de origem.
  if (message.direction !== "inbound") return { estado: "nada" };
  if (message.media_derived_status === "failed") return { estado: "falhou" };
  const recente = agora - new Date(message.created_at).getTime() < JANELA_DE_ANDAMENTO_MS;
  if (message.media_storage_path && recente) return { estado: "em_andamento" };
  return { estado: "nada" };
}

/** Mantida para quem só quer o texto (testes e chamadas antigas). */
export function transcricaoDoAudio(message: CamposDaMensagem): string | null {
  const e = estadoDaTranscricao(message);
  return e.estado === "pronta" ? e.texto : null;
}

const TEXTO_LONGO = 280;

export function TranscricaoDoAudio({ message, isOutbound }: { message: Message; isOutbound: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [tudo, setTudo] = useState(false);
  const e = estadoDaTranscricao(message);

  const tentarDeNovo = useMutation({
    mutationFn: () => apiClient.post(`/api/v1/messages/${message.id}/retranscrever`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", message.conversation_id] }),
    onError: (err) => showApiError(err),
  });

  // Depois do "tentar de novo", o balão espera enquanto o estado não volta — pronto ou falha de novo.
  const aguardando =
    tentarDeNovo.isPending || (tentarDeNovo.isSuccess && (message.media_derived_status ?? null) === null);
  if (e.estado === "nada" && !aguardando) return null;
  const cor = isOutbound ? "text-primary-foreground" : "text-foreground";

  if (e.estado === "em_andamento" || e.estado === "nada" || aguardando) {
    return (
      <p className={cn("mt-1 text-xs italic opacity-70", cor)} data-testid="transcricao-em-andamento">
        {t("Transcrevendo o áudio…")}
      </p>
    );
  }

  if (e.estado === "falhou") {
    return (
      <div className={cn("mt-1 text-xs", cor)} data-testid="transcricao-falhou">
        <span className="opacity-80">{t("Não foi possível transcrever este áudio.")}</span>{" "}
        <button
          type="button"
          onClick={() => tentarDeNovo.mutate()}
          className="underline underline-offset-2 opacity-90 hover:opacity-100 focus-visible:opacity-100"
        >
          {t("Tentar de novo")}
        </button>
      </div>
    );
  }

  if (e.estado !== "pronta") return null;
  const longo = e.texto.length > TEXTO_LONGO;
  const idDoTexto = `transcricao-${message.id}`;
  return (
    <div className="mt-1" data-testid="transcricao-do-audio">
      <p id={idDoTexto} className={cn("whitespace-pre-wrap wrap-anywhere text-sm leading-snug", cor)}>
        {longo && !tudo ? `${e.texto.slice(0, TEXTO_LONGO).trimEnd()}…` : e.texto}
      </p>
      {longo && (
        <button
          type="button"
          aria-expanded={tudo}
          aria-controls={idDoTexto}
          onClick={() => setTudo((v) => !v)}
          className={cn("mt-0.5 text-xs underline underline-offset-2 opacity-80 hover:opacity-100 focus-visible:opacity-100", cor)}
        >
          {tudo ? t("Ver menos") : t("Ver tudo")}
        </button>
      )}
    </div>
  );
}
