"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowsSplit, Robot, Sparkle, User, CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ChannelFlowConfig, ChannelHandlingMode } from "@/lib/channels/channel-flow-config";

interface Props {
  channelId: string;
  channelName: string;
}

export function ChannelFlowConfigDialog({ channelId, channelName }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["channel-flow-config", channelId],
    queryFn: () => apiClient.get<{ data: ChannelFlowConfig }>(`/api/v1/channel-sessions/${channelId}/flow`),
    enabled: open,
  });

  const flowsQuery = useQuery({
    queryKey: ["followup", "flows", "list"],
    queryFn: async () => {
      try {
        const res = await apiClient.get<{ data: Array<{ id: string; name: string; status: string }> }>("/api/v1/ai/followup-flows");
        return Array.isArray(res.data) ? res.data : [];
      } catch {
        return [];
      }
    },
    enabled: open,
  });

  const publishedFlows = Array.isArray(flowsQuery.data)
    ? flowsQuery.data.filter((f) => f.status === "active")
    : [];

  const [mode, setMode] = useState<ChannelHandlingMode>("ai");
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Sincroniza estado quando o modal abre
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && query.data?.data) {
      setMode(query.data.data.handling_mode ?? "ai");
      setSelectedFlowId(query.data.data.default_flow_pointer_id ?? "");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/channel-sessions/${channelId}/flow`, {
        handling_mode: mode,
        default_flow_pointer_id: mode === "flow" && selectedFlowId ? selectedFlowId : null,
      });
      await qc.invalidateQueries({ queryKey: ["channel-flow-config", channelId] });
      await qc.invalidateQueries({ queryKey: ["channel-sessions"] });
      toast.success(t("Configuração de fluxo do número salva com sucesso!"));
      setOpen(false);
    } catch {
      toast.error(t("Erro ao salvar configuração do número."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <ArrowsSplit size={14} className="mr-1.5" aria-hidden />
        {t("Fluxo & Atendimento")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowsSplit size={20} className="text-primary" />
              {t("Automação e Fluxo do Número")}
            </DialogTitle>
            <DialogDescription>
              {t("Escolha como o número")} <strong>{channelName}</strong> {t("deve se comportar ao receber mensagens.")}
            </DialogDescription>
          </DialogHeader>

          {query.isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("Carregando...")}</p>
          ) : (
            <div className="space-y-5 py-2">
              <div className="space-y-3">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("Como este número deve responder?")}
                </Label>

                <div className="space-y-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setMode("flow")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setMode("flow"); }}
                    className={`flex items-start justify-between rounded-lg border p-3 cursor-pointer transition-colors ${mode === "flow" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Sparkle size={16} className="text-amber-500" />
                        {t("Fluxo Direto (Sem IA)")}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("O número roda um fluxo do Canva imediatamente (URA, mensagens fixas, botões, opções). Não consome IA.")}
                      </p>
                    </div>
                    {mode === "flow" && <CheckCircle size={20} className="text-primary shrink-0 mt-0.5" weight="fill" />}
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setMode("ai")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setMode("ai"); }}
                    className={`flex items-start justify-between rounded-lg border p-3 cursor-pointer transition-colors ${mode === "ai" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Robot size={16} className="text-primary" />
                        {t("Agente de IA")}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("O robô de IA responde com linguagem natural e inteligência generativa (configurado em IA › Agentes).")}
                      </p>
                    </div>
                    {mode === "ai" && <CheckCircle size={20} className="text-primary shrink-0 mt-0.5" weight="fill" />}
                  </div>

                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setMode("human")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setMode("human"); }}
                    className={`flex items-start justify-between rounded-lg border p-3 cursor-pointer transition-colors ${mode === "human" ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/40"}`}
                  >
                    <div className="space-y-1 pr-2">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <User size={16} className="text-muted-foreground" />
                        {t("Apenas Atendimento Humano")}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("Sem IA nem automação: as conversas vão direto para a fila dos atendentes da equipe.")}
                      </p>
                    </div>
                    {mode === "human" && <CheckCircle size={20} className="text-primary shrink-0 mt-0.5" weight="fill" />}
                  </div>
                </div>
              </div>

              {mode === "flow" && (
                <div className="space-y-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4">
                  <Label className="text-xs font-semibold text-foreground">
                    {t("Qual fluxo do Canva deve rodar neste número?")}
                  </Label>

                  {publishedFlows.length === 0 ? (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>{t("Nenhum fluxo publicado foi encontrado.")}</p>
                      <Link href="/app/ai/followups" className="text-primary underline underline-offset-2">
                        {t("Ir para o Canva e publicar um fluxo")}
                      </Link>
                    </div>
                  ) : (
                    <Select value={selectedFlowId} onValueChange={(val: string) => setSelectedFlowId(val)}>
                      <SelectTrigger className="w-full bg-background">
                        <SelectValue placeholder={t("Selecione o fluxo do Canva...")} />
                      </SelectTrigger>
                      <SelectContent>
                        {publishedFlows.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("Cancelar")}
            </Button>
            <Button onClick={handleSave} disabled={saving || (mode === "flow" && !selectedFlowId)}>
              {saving ? t("Salvando...") : t("Salvar Configuração")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
