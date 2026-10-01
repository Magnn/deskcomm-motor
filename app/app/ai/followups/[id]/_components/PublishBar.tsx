"use client";

import { useState } from "react";

import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ApiError } from "@/lib/api/types";
import { rascunhoIncompleto, type MotivoDaCaixaIncompleta } from "@/lib/followup/caixas-incompletas";
import type { FlowGraph } from "@/lib/followup/graph-schema";
import type { PublishValidationError } from "@/lib/followup/validate-publish";
import { useT } from "@/hooks/i18n/useT";
import {
  useDisableFollowupFlow,
  usePublishFollowupFlow,
  useRollbackFollowupFlow,
  useSaveFollowupFlowDraft,
  useUpdateHandoffPolicy,
  type FollowupFlowDetailRow,
} from "@/hooks/followup/useFollowupFlow";
import Link from "next/link";
import { ArrowLeft, DownloadSimple, Play, Power, Trash, TreeStructure, WhatsappLogo, X } from "@/lib/ui/icons";
import { exportFlowToTemplate } from "@/lib/followup/export-import";
import { FlowStatusBadge } from "../../_components/FlowStatusBadge";
import { DeleteFollowupFlowButton } from "../../_components/DeleteFollowupFlowButton";
import { RenameFollowupFlowButton } from "../../_components/RenameFollowupFlowButton";
import { TriggerConfigControl } from "./TriggerConfigControl";

interface Props {
  flowId: string;
  flow: FollowupFlowDetailRow;
  graph: FlowGraph;
  dirty: boolean;
  selection: "node" | "edge" | null;
  onDeleteSelection: () => void;
  onSaved: (graph: FlowGraph) => void;
  onPublishErrors: (errorsByNode: Record<string, string[]>) => void;
  onPublishSuccess: () => void;
  onAutoFit?: () => void;
  canAutoFit?: boolean;
  onOpenSimulator: () => void;
  simulatorOpen: boolean;
}

const HANDOFF_LABEL: Record<FollowupFlowDetailRow["handoff_policy"], string> = {
  pause: "Pausar durante handoff",
  cancel: "Cancelar durante handoff",
  allow: "Permitir durante handoff",
};

export function PublishBar({
  flowId,
  flow,
  graph,
  dirty,
  selection,
  onDeleteSelection,
  onSaved,
  onPublishErrors,
  onPublishSuccess,
  onAutoFit,
  canAutoFit = false,
  onOpenSimulator,
  simulatorOpen,
}: Props) {
  const t = useT();
  const [openDeleteSelection, setOpenDeleteSelection] = useState(false);
  const save = useSaveFollowupFlowDraft(flowId);
  const publish = usePublishFollowupFlow(flowId);
  const disable = useDisableFollowupFlow(flowId);
  const rollback = useRollbackFollowupFlow(flowId);
  const handoffPolicy = useUpdateHandoffPolicy(flowId);

  const fraseDoMotivo = (motivo: MotivoDaCaixaIncompleta): string => {
    switch (motivo.tipo) {
      case "conteudo_vazio":
        return t("Esta caixa está vazia — clique em Editar e adicione ao menos um conteúdo.");
      case "item_sem_arquivo":
        return `${t("Item")} ${motivo.item}: ${t("falta enviar o arquivo — envie-o ou remova o item.")}`;
      case "item_sem_link":
        return `${t("Item")} ${motivo.item}: ${t("falta o link do arquivo — preencha-o ou troque para arquivo enviado.")}`;
      case "item_sem_texto":
        return `${t("Item")} ${motivo.item}: ${t("o texto está em branco — escreva-o ou remova o item.")}`;
      case "item_contato_incompleto":
        return `${t("Item")} ${motivo.item}: ${t("o contato precisa de nome e telefone.")}`;
      case "configuracao_incompleta":
        return t("Esta caixa ainda não foi configurada por completo — clique em Editar e preencha o que falta.");
    }
  };

  /**
   * O MOTIVO vai no próprio aviso, com o nome da caixa. Um aviso que diz só
   * "corrija as caixas destacadas" não serve num funil grande: a caixa vermelha
   * pode estar fora da tela, e o dono fica sem saber o que fazer.
   */
  const avisarComMotivos = (titulo: string, motivos: string[]) => {
    const MOSTRAR = 3;
    const resto = motivos.length - MOSTRAR;
    toast.error(titulo, {
      description: (
        <ul className="mt-1 list-disc space-y-1 pl-4" data-testid="publicar-motivos">
          {motivos.slice(0, MOSTRAR).map((m, i) => (
            <li key={i}>{m}</li>
          ))}
          {resto > 0 && <li>{`${t("e mais")} ${resto} — ${t("veja as caixas destacadas em vermelho.")}`}</li>}
        </ul>
      ),
      duration: 15_000,
    });
  };

  /**
   * Confere o rascunho ANTES de chamar o servidor. Uma caixa incompleta faz o
   * PATCH recusar o fluxo inteiro com "Campos inválidos.", sem dizer onde — e
   * como publicar começa por salvar, o "Publicar" parecia não funcionar. Aqui a
   * caixa é pintada e o motivo fica escrito nela. `false` = não seguir.
   */
  const rascunhoPodeSerSalvo = (): boolean => {
    const { caixas, doFluxo } = rascunhoIncompleto(graph);
    if (caixas.length === 0 && !doFluxo) {
      onPublishErrors({}); // limpa marcas de uma tentativa anterior já corrigida
      return true;
    }
    const porCaixa: Record<string, string[]> = {};
    const motivos: string[] = [];
    for (const c of caixas) {
      const frase = fraseDoMotivo(c.motivo);
      (porCaixa[c.node_id] ??= []).push(frase);
      const rotulo = graph.nodes.find((n) => n.id === c.node_id)?.label;
      motivos.push(rotulo ? `${rotulo}: ${frase}` : frase);
    }
    onPublishErrors(porCaixa);
    if (motivos.length === 0) {
      toast.error(t("O fluxo ainda não pode ser salvo: ele precisa de ao menos duas caixas ligadas."));
    } else {
      avisarComMotivos(t("O fluxo ainda não pode ser salvo."), motivos);
    }
    return false;
  };

  const onSave = () => {
    if (!rascunhoPodeSerSalvo()) return;
    save.mutate(graph, { onSuccess: () => onSaved(graph) });
  };

  const onPublish = async () => {
    if (!rascunhoPodeSerSalvo()) return;
    try {
      await save.mutateAsync(graph);
      onSaved(graph);
    } catch {
      return; // save's own onError already toasted — don't attempt publish on a failed save
    }

    publish.mutate(undefined, {
      onSuccess: () => onPublishSuccess(),
      onError: (err) => {
        if (err instanceof ApiError && err.code === "validation_failed") {
          const errors = (err.details?.errors as PublishValidationError[] | undefined) ?? [];
          const byNode: Record<string, string[]> = {};
          const motivos: string[] = [];
          for (const e of errors) {
            if (!e.node_id) {
              motivos.push(e.message);
              continue;
            }
            (byNode[e.node_id] ??= []).push(e.message);
            const rotulo = graph.nodes.find((n) => n.id === e.node_id)?.label;
            // Mensagem que já cita a caixa pelo nome não ganha o nome de novo.
            motivos.push(rotulo && !e.message.includes(`"${rotulo}"`) ? `${rotulo}: ${e.message}` : e.message);
          }
          onPublishErrors(byNode);
          avisarComMotivos(t("O fluxo não pôde ser publicado."), motivos);
          return;
        }
        showApiError(err);
      },
    });
  };

  const onDisable = () => disable.mutate();

  const canRollback = flow.versions_count > 1 && flow.previous_version_id !== null;
  const onRollback = () => {
    if (!flow.previous_version_id) return;
    rollback.mutate(flow.previous_version_id);
  };

  const handleExport = () => {
    try {
      const pkg = exportFlowToTemplate({
        name: flow.name,
        nodes: graph.nodes,
        edges: graph.edges,
      });
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fluxo-${flow.name.toLowerCase().replace(/[^a-z0-9]/g, "-") || "template"}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("Modelo exportado com sucesso!"));
    } catch {
      toast.error(t("Erro ao exportar modelo de fluxo."));
    }
  };

  const busy = save.isPending || publish.isPending || disable.isPending || rollback.isPending;

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-surface px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Lado Esquerdo: Botões estilo Lailla / AcassIA (Voltar roxo, Fechar laranja, Status verde) */}
        <div className="flex items-center gap-2">
          <Link
            href="/app/ai/followups"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#7c3aed] text-white hover:bg-[#6d28d9] transition-all shadow-xs"
            title={t("Voltar aos fluxos")}
          >
            <ArrowLeft size={16} weight="bold" />
          </Link>

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#f97316] text-white hover:bg-[#ea580c] transition-all shadow-xs"
            onClick={() => window.history.back()}
            title={t("Fechar")}
          >
            <X size={15} weight="bold" />
          </button>

          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#10b981] text-white hover:bg-[#059669] transition-all shadow-xs"
            onClick={onPublish}
            disabled={busy}
            title={t("Publicar / Ativo")}
          >
            <Power size={15} weight="bold" />
          </button>
        </div>

        {/* Centro: Título com Logo WhatsApp + Badge de Status + Seletor de Tabs */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <WhatsappLogo size={18} weight="fill" className="text-emerald-500" />
            <h1 className="text-sm font-bold text-slate-800 dark:text-neutral-100">{flow.name}</h1>
            <RenameFollowupFlowButton
              flowId={flowId}
              flowName={flow.name}
              variant="ghost"
              size="icon"
            />
            {dirty ? (
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 shadow-2xs dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-400">
                {t("Alterações não salvas")}
              </span>
            ) : (
              <span className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-[10px] font-bold text-white shadow-2xs tracking-wide">
                SALVO
              </span>
            )}
          </div>

          <div className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-100/80 p-0.5 text-xs shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
            <button
              type="button"
              className="cursor-pointer rounded-full px-3 py-0.5 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400"
            >
              Logs
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full bg-[#7c3aed] px-3.5 py-0.5 text-[11px] font-bold text-white shadow-xs"
            >
              {t("Automação")}
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-full px-3 py-0.5 text-[11px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400"
            >
              {t("Relatórios")}
            </button>
          </div>
        </div>

        {/* Lado Direito: Ações rápidas */}
        <div className="flex flex-wrap items-center gap-2">
          <TriggerConfigControl flowId={flowId} flowStatus={flow.status} triggerConfig={flow.trigger_config} />

          <Select value={flow.handoff_policy} onValueChange={(v) => handoffPolicy.mutate(v as FollowupFlowDetailRow["handoff_policy"])}>
            <SelectTrigger className="h-8 w-44 text-xs" aria-label={t("Política de handoff")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(HANDOFF_LABEL) as Array<keyof typeof HANDOFF_LABEL>).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {t(HANDOFF_LABEL[k])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="button" variant="secondary" size="sm" className="h-8 text-xs font-semibold" disabled={!dirty || busy} onClick={onSave}>
            {save.isPending ? t("Salvando…") : t("Salvar")}
          </Button>
          <Button type="button" size="sm" className="h-8 bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-xs font-semibold" disabled={busy} onClick={onPublish} data-testid="publish-button">
            {publish.isPending ? t("Publicando…") : t("Publicar")}
          </Button>
          <Button
            type="button"
            variant={simulatorOpen ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs font-semibold"
            onClick={onOpenSimulator}
            data-testid="open-simulator"
          >
            <Play size={13} aria-hidden className="mr-1" />
            {t("Simular")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold"
            disabled={busy || flow.status === "disabled"}
            onClick={onDisable}
          >
            {t("Desativar")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold"
            disabled={busy || !canRollback}
            onClick={onRollback}
            data-testid="rollback-button"
          >
            {t("Rollback")}
          </Button>
          {onAutoFit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              disabled={!canAutoFit}
              onClick={onAutoFit}
              data-testid="auto-fit-flow"
            >
              <TreeStructure size={13} aria-hidden className="mr-1" />
              {t("Organizar")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs font-semibold"
            onClick={handleExport}
            data-testid="export-flow"
          >
            <DownloadSimple size={13} aria-hidden className="mr-1" />
            {t("Exportar")}
          </Button>
        {selection ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              data-testid="delete-selection"
              onClick={() => setOpenDeleteSelection(true)}
            >
              <Trash size={14} aria-hidden className="mr-1" />
              {selection === "node" ? t("Excluir nó") : t("Excluir aresta")}
            </Button>
            <AlertDialog open={openDeleteSelection} onOpenChange={setOpenDeleteSelection}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {selection === "node" ? t("Excluir este nó?") : t("Excluir esta aresta?")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {selection === "node"
                      ? t("Este nó e as arestas ligadas a ele são apagados. Não é possível desfazer.")
                      : t("A aresta entre os dois nós é apagada. Não é possível desfazer.")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      setOpenDeleteSelection(false);
                      onDeleteSelection();
                    }}
                  >
                    {t("Excluir")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <DeleteFollowupFlowButton flowId={flowId} flowName={flow.name} redirectToList />
        )}
      </div>
    </div>
  </div>
  );
}
