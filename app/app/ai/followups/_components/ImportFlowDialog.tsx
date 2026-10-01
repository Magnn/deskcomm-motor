"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UploadSimple, FileCode, Check, Warning } from "@/lib/ui/icons";
import { importFlowTemplate, type FlowTemplatePackage } from "@/lib/followup/export-import";
import { useCreateFollowupFlow } from "@/hooks/followup/useFollowupFlows";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

interface ImportFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportFlowDialog({ open, onOpenChange }: ImportFlowDialogProps) {
  const t = useT();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [templateData, setTemplateData] = useState<ReturnType<typeof importFlowTemplate> | null>(null);
  const [flowName, setFlowName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const create = useCreateFollowupFlow();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    setError(null);
    if (!selected) return;

    if (!selected.name.endsWith(".json")) {
      setError("Por favor, selecione um arquivo de modelo .json válido.");
      return;
    }

    setFile(selected);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const imported = importFlowTemplate(content);
        setTemplateData(imported);
        setFlowName(imported.name ? `${imported.name} (Importado)` : "Novo Fluxo Importado");
      } catch (err: unknown) {
        setError("O arquivo JSON não é um modelo de fluxo válido.");
        setTemplateData(null);
      }
    };
    reader.readAsText(selected);
  };

  const handleImport = async () => {
    if (!templateData || !flowName.trim()) return;

    setIsProcessing(true);
    setError(null);

    try {
      // 1. Cria o novo fluxo na organização
      const createdFlow = await create.mutateAsync(flowName.trim());

      // 2. Salva o grafo de nós e arestas importado
      await apiClient.put(`/api/v1/ai/followup-flows/${createdFlow.id}/draft`, {
        graph: {
          nodes: templateData.nodes,
          edges: templateData.edges,
        },
      });

      toast.success(t("Modelo importado com sucesso!"));
      onOpenChange(false);
      router.push(`/app/ai/followups/${createdFlow.id}`);
    } catch {
      setError("Não foi possível salvar o fluxo importado. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple className="h-5 w-5 text-primary" />
            Importar Modelo de Fluxo
          </DialogTitle>
          <DialogDescription>
            Importe um pacote de fluxo em formato JSON gerado pelo Deskcomm ou pelo ChatbotX.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />

          {!templateData ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-muted p-6 text-center hover:border-primary/50 hover:bg-muted/10 transition-all cursor-pointer"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileCode className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Clique para selecionar o arquivo .json
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Formatos aceitos: modelos de exportação Deskcomm e ChatbotX
                </p>
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span className="text-xs font-semibold">Modelo Validado com Sucesso</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => {
                    setFile(null);
                    setTemplateData(null);
                  }}
                >
                  Trocar Arquivo
                </Button>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome do Novo Fluxo</Label>
                <Input
                  value={flowName}
                  onChange={(e) => setFlowName(e.target.value)}
                  className="h-9 text-sm"
                  placeholder="Nome do fluxo no CRM"
                />
              </div>

              <div className="text-[11px] text-muted-foreground flex gap-4 pt-1">
                <span>Nós: <strong>{templateData.nodes.length}</strong></span>
                <span>Conexões: <strong>{templateData.edges.length}</strong></span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <Warning className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={!templateData || !flowName.trim() || isProcessing}
              onClick={handleImport}
              className="gap-1.5"
            >
              <Check className="h-4 w-4" />
              {isProcessing ? "Importando…" : "Importar e Abrir no Canvas"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
