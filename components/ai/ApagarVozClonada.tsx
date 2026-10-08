"use client";
/**
 * "Apagar voz" — a saída de uma voz clonada.
 *
 * A rota já existia (`DELETE /api/v1/ai/voices/:provider/:voiceId`) e nenhuma tela a chamava:
 * quem clonava uma voz errada, ou de alguém que retirou o consentimento, não tinha como tirá-la.
 *
 * A recusa da rota é o que protege: voz em uso por um agente não é apagada, e a mensagem diz
 * por quais agentes. Aqui só se confirma e se mostra o que a rota respondeu.
 */
import * as React from "react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

interface Props {
  provedor: string;
  vozId: string;
  nome: string;
  /** Chamado depois de a voz ser apagada no provedor. */
  aoApagar: () => void;
}

export function ApagarVozClonada({ provedor, vozId, nome, aoApagar }: Props) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [apagando, setApagando] = React.useState(false);

  async function apagar(): Promise<void> {
    setApagando(true);
    try {
      await apiClient.delete(`/api/v1/ai/voices/${encodeURIComponent(provedor)}/${encodeURIComponent(vozId)}`);
      toast.success(t("Voz apagada."));
      setAberto(false);
      aoApagar();
    } catch (err) {
      showApiError(err);
    } finally {
      setApagando(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)} data-testid="apagar-voz">
        {t("Apagar voz")}
      </Button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Apagar a voz")} “{nome}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("A voz clonada é removida da sua conta no provedor de voz e não pode ser recuperada. Se algum agente estiver usando esta voz, ela não é apagada e o aviso diz qual.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apagando}>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirmar-apagar-voz"
              disabled={apagando}
              onClick={(e) => {
                // O diálogo só fecha depois da resposta: recusa (voz em uso) precisa ficar à vista.
                e.preventDefault();
                void apagar();
              }}
            >
              {apagando ? t("Apagando…") : t("Apagar voz")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
