"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

import { useT } from "@/hooks/i18n/useT";
import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FlowArrow, Plus, Sparkle, UploadSimple } from "@/lib/ui/icons";
import { useFollowupFlows, type FollowupFlowPointerRow } from "@/hooks/followup/useFollowupFlows";
import { cn } from "@/lib/utils";
import { ORIGENS_DO_INICIO } from "@/lib/followup/graph-schema";
import { ORIGENS_DO_INICIO_ROTULO } from "@/lib/followup/vocabulario";
import { DeleteFollowupFlowButton } from "./DeleteFollowupFlowButton";
import { DuplicateFollowupFlowButton } from "./DuplicateFollowupFlowButton";
import { FlowStatusBadge } from "./FlowStatusBadge";
import { ModelosDialog } from "./ModelosDialog";
import { NewFlowDialog } from "./NewFlowDialog";
import { ImportFlowDialog } from "./ImportFlowDialog";
import { RenameFollowupFlowButton } from "./RenameFollowupFlowButton";

interface Props {
  initialData: FollowupFlowPointerRow[];
  canWrite: boolean;
}

function formatUpdatedAt(iso: string, idioma: string): string {
  return new Date(iso).toLocaleDateString(idioma, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/**
 * O fluxo passa nos filtros da lista? Pura, para ter teste sem tela.
 * "oficial" / "business" = o fluxo é dono de algum número daquele tipo; fluxo
 * sem número vinculado só aparece em "Todos".
 */
export function fluxoPassaNosFiltros(
  flow: Pick<FollowupFlowPointerRow, "inicio_origem" | "numeros">,
  canal: "todos" | "oficial" | "business",
  gatilho: string,
): boolean {
  if (canal !== "todos") {
    const tipo = canal === "oficial" ? "oficial" : "qr";
    if (!(flow.numeros ?? []).includes(tipo)) return false;
  }
  if (gatilho !== "todos" && (flow.inicio_origem ?? "whatsapp") !== gatilho) return false;
  return true;
}

export function FlowsList({ initialData, canWrite }: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const { data } = useFollowupFlows({ initialData });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [modelosOpen, setModelosOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState<"todos" | "oficial" | "business">("todos");
  const [triggerFilter, setTriggerFilter] = useState<string>("todos");

  const flows = data ?? [];

  // OS FILTROS LEEM O DADO DO FLUXO. Antes liam o localStorage do navegador — a
  // escolha que o criador do fluxo fez NAQUELE computador —, então em qualquer
  // outro lugar todo fluxo aparecia como "App Business" e "WhatsApp", e os outros
  // filtros esvaziavam a lista. Agora:
  //   - canal:   o tipo dos números que têm o fluxo como dono (oficial ou por QR);
  //   - gatilho: a origem configurada na caixa "Início".
  const filteredFlows = flows.filter((flow) => fluxoPassaNosFiltros(flow, channelFilter, triggerFilter));

  // ⚠️ "Começar de um modelo" vem ANTES de "Novo fluxo", e na tela vazia é o
  // botão cheio. Quem chega aqui numa instalação nova não sabe o que é nó, ramo
  // ou prazo de graça — mandá-lo para uma tela em branco é o caminho mais curto
  // para a clínica nunca ter follow-up nenhum. Desenhar do zero continua a um
  // clique, para quem já sabe o que quer.
  const modelosButton = (
    <Button onClick={() => setModelosOpen(true)} variant="outline" className="w-full sm:w-auto">
      <Sparkle size={14} aria-hidden className="mr-2" /> {t("Começar de um modelo")}
    </Button>
  );

  const importButton = (
    <Button onClick={() => setImportOpen(true)} variant="outline" className="w-full sm:w-auto">
      <UploadSimple size={14} aria-hidden className="mr-2" /> {t("Importar modelo")}
    </Button>
  );

  const newFlowButton = (
    <Button
      onClick={() => setDialogOpen(true)}
      className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-purple-500/20 active:scale-[0.98] transition-all border-0 cursor-pointer"
    >
      <Plus size={15} aria-hidden className="mr-1.5" /> {t("Criar novo fluxo")}
    </Button>
  );

  const dialogos = canWrite && (
    <>
      <NewFlowDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <ModelosDialog
        open={modelosOpen}
        onOpenChange={setModelosOpen}
        nomesExistentes={flows.map((f) => f.name)}
      />
      <ImportFlowDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );

  if (flows.length === 0) {
    return (
      <>
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FlowArrow size={36} aria-hidden className="text-text-muted" />
          <h2 className="font-medium">{t("Nenhum fluxo de follow-up ainda")}</h2>
          <p className="max-w-sm text-sm text-text-muted">
            {t(
              "Follow-ups reengajam contatos após silêncio, mudança de etapa, uma regra em Webhooks ou a resposta do contato — sem depender de alguém lembrar de mandar mensagem.",
            )}
          </p>
          {canWrite && (
            <div className="mt-1 flex flex-col items-center gap-2 sm:flex-row">
              {modelosButton}
              {importButton}
              {newFlowButton}
            </div>
          )}
        </Card>
        {dialogos}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de Filtros e Ações estilo AcassIA */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Filtros: Pílulas de Canal e Dropdown de Gatilhos */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center rounded-full border border-border bg-surface-elevated p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setChannelFilter("todos")}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all",
                channelFilter === "todos"
                  ? "bg-surface text-text shadow-xs"
                  : "text-text-muted hover:text-text",
              )}
            >
              {t("Todos")}
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter("oficial")}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all",
                channelFilter === "oficial"
                  ? "border border-cat-green bg-cat-green-bg text-cat-green-fg shadow-xs"
                  : "text-text-muted hover:text-cat-green",
              )}
            >
              {t("Número oficial")}
            </button>
            <button
              type="button"
              onClick={() => setChannelFilter("business")}
              className={cn(
                "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all",
                channelFilter === "business"
                  ? "border border-cat-green bg-cat-green-bg text-cat-green-fg shadow-xs"
                  : "text-text-muted hover:text-cat-green",
              )}
            >
              {t("Número por QR code")}
            </button>
          </div>

          <Select value={triggerFilter} onValueChange={setTriggerFilter}>
            <SelectTrigger className="h-8 w-auto min-w-[145px] rounded-full border-border bg-surface text-xs font-medium">
              <SelectValue placeholder={t("Gatilhos: todos")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">{t("Gatilhos: todos")}</SelectItem>
              {/* As origens que a caixa "Início" de fato grava — nem uma a mais. */}
              {ORIGENS_DO_INICIO.map((origem) => (
                <SelectItem key={origem} value={origem}>
                  {t(ORIGENS_DO_INICIO_ROTULO[origem])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {canWrite && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {modelosButton}
            {importButton}
            {newFlowButton}
          </div>
        )}
      </div>

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filteredFlows.map((flow) => (
          <li key={flow.id}>
            <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-accent-400">
              <Link href={`/app/ai/followups/${flow.id}`} className="flex flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 flex-1 truncate font-medium" title={flow.name}>
                    {flow.name}
                  </h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* O selo diz a qual tipo de número o fluxo está VINCULADO — lido do
                        vínculo real. Sem número vinculado não há selo: antes todo
                        fluxo aparecia como "App Business", o que não era verdade. */}
                    {(flow.numeros ?? []).map((tipo) => (
                      <span
                        key={tipo}
                        data-testid={`fluxo-numero-${tipo}`}
                        className="rounded-full border border-cat-green/60 bg-cat-green-bg px-2 py-0.5 text-[10.5px] font-semibold text-cat-green-fg"
                      >
                        {tipo === "oficial" ? t("Número oficial") : t("Número por QR code")}
                      </span>
                    ))}
                    <FlowStatusBadge status={flow.status} />
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div>
                    <dt className="text-text-muted">{t("Versão")}</dt>
                    <dd className="font-mono">{flow.active_version_id ? "publicada" : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-text-muted">Handoff</dt>
                    <dd className="font-mono">{flow.handoff_policy}</dd>
                  </div>
                </dl>
                <p className="mt-auto pt-2 text-xs text-text-muted">
                  Atualizado em {formatUpdatedAt(flow.updated_at, tagDoIdioma)}
                </p>
              </Link>
              {canWrite && (
                <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
                  <RenameFollowupFlowButton flowId={flow.id} flowName={flow.name} />
                  <DuplicateFollowupFlowButton flowId={flow.id} />
                  <DeleteFollowupFlowButton flowId={flow.id} flowName={flow.name} />
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {dialogos}
    </div>
  );
}
