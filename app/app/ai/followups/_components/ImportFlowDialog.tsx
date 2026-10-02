"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { UploadSimple, FileCode, Check, Warning } from "@/lib/ui/icons";
import { importFlowTemplate, type FlowTemplatePackage } from "@/lib/followup/export-import";
import { flowGraphSchema } from "@/lib/followup/graph-schema";
import { useCreateFollowupFlow } from "@/hooks/followup/useFollowupFlows";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";

interface ImportFlowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Quantos itens de mídia o fluxo importado referencia por ARQUIVO. O arquivo
 * exportado leva só o caminho do arquivo no armazenamento de quem exportou — a
 * mídia em si não viaja. Sem aviso, o fluxo importado publicava e o item era
 * pulado em silêncio no envio.
 */
export function midiasNoArquivo(nodes: ReadonlyArray<Record<string, unknown>>): number {
  let total = 0;
  for (const node of nodes) {
    const itens = (node.config as { items?: unknown } | undefined)?.items;
    if (!Array.isArray(itens)) continue;
    for (const item of itens) {
      if (typeof (item as { storage_path?: unknown } | null)?.storage_path === "string") total++;
    }
  }
  return total;
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

    // O arquivo é conferido pelo MESMO schema que o servidor usa para salvar um
    // rascunho, e ANTES de criar o fluxo: arquivo incompatível não deixa um fluxo
    // vazio para trás, e a recusa diz onde está o problema.
    const conferido = flowGraphSchema.safeParse({ nodes: templateData.nodes, edges: templateData.edges });
    if (!conferido.success) {
      const onde = conferido.error.issues[0]?.path.slice(0, 3).join(" › ") ?? "";
      setError(
        `${t("Este arquivo não é um fluxo compatível com esta versão do sistema.")}${onde ? ` (${onde})` : ""}`,
      );
      setIsProcessing(false);
      return;
    }

    try {
      // 1. Cria o novo fluxo na organização
      const createdFlow = await create.mutateAsync(flowName.trim());

      // 2. Salva o grafo importado como rascunho — a MESMA rota do botão Salvar do
      // construtor. (Isto chamava `PUT …/draft`, uma rota que nunca existiu: toda
      // importação criava o fluxo vazio e terminava em erro.)
      await apiClient.patch(`/api/v1/ai/followup-flows/${createdFlow.id}`, { draft_graph: conferido.data });

      toast.success(t("Modelo importado com sucesso!"));
      onOpenChange(false);
      router.push(`/app/ai/followups/${createdFlow.id}`);
    } catch {
      setError(t("Não foi possível salvar o fluxo importado. Tente novamente."));
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
            {t("Importe um fluxo em formato JSON exportado por este sistema (botão Exportar do construtor).")}
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
                  {t("Clique para selecionar o arquivo .json")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("Formato aceito: arquivo exportado por este sistema")}
                </p>
              </div>
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span className="text-xs font-semibold">{t("Modelo Validado com Sucesso")}</span>
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
                <span>{t("Nós:")} <strong>{templateData.nodes.length}</strong></span>
                <span>{t("Conexões:")} <strong>{templateData.edges.length}</strong></span>
              </div>
              {midiasNoArquivo(templateData.nodes) > 0 && (
                <p className="text-[11px] text-warning-fg" data-testid="importar-aviso-de-midia">
                  {t("Este fluxo tem imagens, áudios ou arquivos. Eles não vêm dentro do arquivo exportado: depois de importar, abra as caixas de Conteúdo e envie as mídias de novo.")}
                </p>
              )}
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
