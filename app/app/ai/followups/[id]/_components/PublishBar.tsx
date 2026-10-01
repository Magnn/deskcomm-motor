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
import { ArrowLeft, Play, Power, Trash, TreeStructure, WhatsappLogo, X } from "@/lib/ui/icons";
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

  const onSave = () => {
    save.mutate(graph, { onSuccess: () => onSaved(graph) });
  };

  const onPublish = async () => {
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
          const flowLevel: string[] = [];
          for (const e of errors) {
            if (e.node_id) (byNode[e.node_id] ??= []).push(e.message);
            else flowLevel.push(e.message);
          }
          onPublishErrors(byNode);
          toast.error(t("Fluxo reprovado na validação — corrija os nós destacados."), {
            description: flowLevel.length > 0 ? flowLevel.join(" ") : undefined,
          });
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
          <TriggerConfigControl flowId={flowId} triggerConfig={flow.trigger_config} />

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
