"use client";
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

interface Estado {
  ativo: boolean;
  mensagem: string;
  ultimos: { status: "pending" | "sent" | "failed"; error: string | null; created_at: string }[];
}

/**
 * Comentou na página, recebe mensagem no Messenger — o controle do canal. Quem comenta numa publicação ou num
 * anúncio da página recebe esta mensagem no Messenger (uma por comentário); quando responde, a conversa segue no
 * inbox com o agente do canal. Lido pelo webhook em `lib/channels/messenger/comentarios.ts`.
 */
export function RespostaAComentario({ channelId }: { channelId: string }) {
  const t = useT();
  const query = useQuery({
    queryKey: ["messenger-resposta-a-comentario", channelId],
    queryFn: async () => (await apiClient.get<{ data: Estado }>(`/api/v1/messenger/${channelId}/resposta-a-comentario`)).data,
  });
  if (query.isPending) return <p className="text-sm text-muted-foreground">{t("Carregando…")}</p>;
  if (query.isError || !query.data) {
    return <p role="alert" className="text-sm text-destructive">{t("Não foi possível carregar a resposta a comentários.")}</p>;
  }
  return <Formulario channelId={channelId} estado={query.data} />;
}

function Formulario({ channelId, estado }: { channelId: string; estado: Estado }) {
  const t = useT();
  const id = useId();
  const qc = useQueryClient();
  const [ativo, setAtivo] = useState(estado.ativo);
  const [mensagem, setMensagem] = useState(estado.mensagem);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (mensagem.trim() === "") {
      setErro(t("Escreva a mensagem que vai para quem comentar."));
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await apiClient.put(`/api/v1/messenger/${channelId}/resposta-a-comentario`, { ativo, mensagem: mensagem.trim() });
      await qc.invalidateQueries({ queryKey: ["messenger-resposta-a-comentario", channelId] });
      toast.success(t("Resposta a comentários salva."));
    } catch {
      setErro(t("Não foi possível salvar a resposta a comentários."));
    } finally {
      setSalvando(false);
    }
  }

  const enviados = estado.ultimos.filter((u) => u.status === "sent").length;
  const falha = estado.ultimos.find((u) => u.status === "failed");

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${id}-ativo`}>{t("Comentou no anúncio, recebe mensagem no Messenger")}</Label>
        <Switch id={`${id}-ativo`} checked={ativo} disabled={salvando} onCheckedChange={setAtivo} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("Quem comentar numa publicação ou anúncio desta página recebe esta mensagem no Messenger, uma vez por comentário. Quando a pessoa responder, a conversa segue na caixa de entrada com o agente do canal.")}
      </p>
      <Textarea
        id={`${id}-mensagem`}
        aria-label={t("Mensagem para quem comentar")}
        rows={3}
        maxLength={2000}
        value={mensagem}
        disabled={salvando}
        onChange={(e) => {
          setMensagem(e.target.value);
          setErro(null);
        }}
      />
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {estado.ultimos.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("Últimos comentários:")} {enviados} / {estado.ultimos.length} {t("respondidos.")}
          {falha?.error ? ` ${t("Última falha:")} ${falha.error}` : ""}
        </p>
      )}
      <div>
        <Button variant="outline" disabled={salvando} onClick={() => void salvar()}>
          {salvando ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </div>
  );
}
