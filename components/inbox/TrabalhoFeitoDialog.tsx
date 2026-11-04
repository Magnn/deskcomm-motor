"use client";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { useTrabalhoFeito } from "@/hooks/inbox/useRegistrarPagamento";

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * A prova de execução: quem fez a parte do altar confirma aqui, e o agente avisa a cliente. A foto da
 * vela, se houver, vai antes pela própria conversa — o agente só fala dela se ela estiver lá.
 */
export function TrabalhoFeitoDialog({ conversationId, open, onOpenChange }: Props) {
  const t = useT();
  const avisar = useTrabalhoFeito();
  const [observacao, setObservacao] = useState("");

  const enviar = () =>
    avisar.mutate(
      { conversation_id: conversationId, observacao: observacao.trim() },
      {
        onSuccess: () => {
          toast.success(t("Pronto: o agente vai avisar a cliente que o trabalho foi feito."));
          onOpenChange(false);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Trabalho feito")}</DialogTitle>
          <DialogDescription>
            {t(
              "Confirme só depois de terminar a parte do altar. O agente avisa a cliente e lembra a parte dela em casa. Se tiver foto da vela, mande antes aqui na conversa.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1">
          <Label htmlFor="trabalho-observacao">{t("Algo para ela saber (opcional)")}</Label>
          <Textarea
            id="trabalho-observacao"
            data-testid="trabalho-observacao"
            maxLength={300}
            value={observacao}
            placeholder={t("Ex.: acendemos a vela às 21h")}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Cancelar")}
          </Button>
          <Button data-testid="trabalho-confirmar" disabled={avisar.isPending} onClick={enviar}>
            {avisar.isPending ? t("Avisando...") : t("Confirmar e avisar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
