"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { CircleNotch, Trash } from "@/lib/ui/icons";

/**
 * Desconectar um canal que não é número (página do Messenger, bot do Telegram)
 * pela rota PADRÃO de excluir canal: ela desliga o recebimento na plataforma,
 * arquiva quando há histórico e audita — a mesma porta para todo canal.
 */
export function DesconectarCanalDialog({
  canalId,
  nome,
  descricao,
  sucesso,
  onCancel,
  onDone,
}: {
  canalId: string;
  nome: string;
  descricao: string;
  sucesso: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  const t = useT();
  const [enviando, setEnviando] = useState(false);
  const desconectar = async () => {
    setEnviando(true);
    try {
      await apiClient.delete(`/api/v1/channel-sessions/${canalId}`);
      toast.success(sucesso);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Não foi possível desconectar."));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && !enviando && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("Desconectar")} {nome}?
          </DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={enviando} onClick={onCancel}>
            {t("Cancelar")}
          </Button>
          <Button variant="destructive" disabled={enviando} onClick={desconectar}>
            {enviando ? <CircleNotch size={14} className="animate-spin" aria-hidden /> : <Trash size={14} aria-hidden />}
            {t("Desconectar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
