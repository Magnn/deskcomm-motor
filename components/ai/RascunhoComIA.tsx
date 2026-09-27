"use client";
/**
 * O botão "Gerar rascunho com IA" — um acelerador de preenchimento para as abas
 * estruturadas do agente (Identidade, Limites), não uma aba nova nem um domínio de
 * prompt novo.
 *
 * A IA só recebe UMA coisa: a descrição do negócio que o dono escreve na hora. Tom,
 * tratamento, emojis e tamanho já são campos fechados na própria aba de Identidade — o
 * rascunho não repete essa escolha, só preenche o texto livre ao redor dela.
 *
 * Nada é salvo por aqui: `onRascunho` só mescla os campos propostos no estado local do
 * formulário da aba, que o dono revisa e edita antes de clicar no "Salvar" de sempre.
 */
import * as React from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { MAX_CONTEXTO, MIN_CONTEXTO, type CampoRascunhavel } from "@/lib/rascunho-ia/tipos";

interface Props {
  agentId: string;
  campo: CampoRascunhavel;
  disabled?: boolean;
  /** Recebe os campos que a IA propôs — quem chama decide como mesclar no próprio formulário. */
  onRascunho: (dados: Record<string, unknown>) => void;
}

interface RespostaRascunho {
  data: { campo: CampoRascunhavel; rascunho: Record<string, unknown> };
}

export function RascunhoComIA({ agentId, campo, disabled, onRascunho }: Props) {
  const t = useT();
  const [aberto, setAberto] = React.useState(false);
  const [contexto, setContexto] = React.useState("");
  const [gerando, setGerando] = React.useState(false);

  const gerar = async () => {
    setGerando(true);
    try {
      const res = await apiClient.post<RespostaRascunho>(
        `/api/v1/ai/agents/${agentId}/rascunho`,
        { campo, contexto: contexto.trim() },
        { timeoutMs: 60_000 },
      );
      onRascunho(res.data.rascunho);
      toast.success(t("Rascunho gerado. Revise e ajuste antes de salvar."));
      setAberto(false);
      setContexto("");
    } catch (err) {
      showApiError(err);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        if (!gerando) setAberto(v);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled} className="gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {t("Gerar rascunho com IA")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Gerar rascunho com IA")}</DialogTitle>
          <DialogDescription>
            {t(
              "Conte em poucas frases sobre o negócio. A IA propõe os campos desta aba — você revisa e edita antes de salvar.",
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Textarea
            rows={4}
            maxLength={MAX_CONTEXTO}
            placeholder={t(
              "Ex.: somos uma clínica de estética em Fortaleza, atendemos mulheres de 25 a 50 anos, o carro-chefe é limpeza de pele e botox.",
            )}
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            disabled={gerando}
            autoFocus
          />
          <p className="text-xs text-text-muted">
            {t("Isto não é salvo em lugar nenhum — só vai para a geração do rascunho.")}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={gerando}>
            {t("Cancelar")}
          </Button>
          <Button
            type="button"
            onClick={() => void gerar()}
            disabled={gerando || contexto.trim().length < MIN_CONTEXTO}
          >
            {gerando ? t("Gerando…") : t("Gerar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
