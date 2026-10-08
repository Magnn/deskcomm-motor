"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { useT } from "@/hooks/i18n/useT";
import { ChatCircle, Clock, Tag } from "@/lib/ui/icons";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function MatchReplyNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const config = data.config as ConfigOf<"match_reply">;
  const branches = config.branches || [];
  const questionText = config.question?.trim() || t("Aguardando resposta do lead...");
  const saveKey =
    config.save_to?.kind === "contact_name"
      ? "nome_do_contato"
      : config.save_to?.kind === "lead_custom"
        ? config.save_to.key
        : null;

  const customPreview = (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-purple-200/80 bg-gradient-to-b from-purple-50/50 to-white p-2.5 text-xs shadow-2xs dark:border-purple-900/40 dark:from-purple-950/20 dark:to-neutral-900">
      {/* Balão da Pergunta */}
      <div className="relative rounded-lg border border-cat-violet/30 bg-surface p-2 text-[11px] leading-relaxed text-text shadow-2xs">
        <div className="flex items-center gap-1.5 font-bold text-cat-violet-fg mb-0.5">
          <ChatCircle size={13} weight="fill" className="shrink-0" />
          <span>{t("Pergunta ao contato")}</span>
        </div>
        <p className="line-clamp-2 italic text-text-muted font-sans">
          "{questionText}"
        </p>
      </div>

      {/* Badges de Variável Salva e Timeout */}
      <div className="flex items-center justify-between gap-1 text-[10px]">
        {saveKey ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-cat-violet-bg px-1.5 py-0.5 font-mono font-semibold text-cat-violet-fg truncate max-w-[120px]">
            <Tag size={10} className="shrink-0" />
            <span>&#123;&#123;{saveKey}&#125;&#125;</span>
          </span>
        ) : (
          <span className="text-text-subtle italic text-[10px]">{t("Sem salvar")}</span>
        )}

        {config.expiracao_tempo && (
          <span className="inline-flex items-center gap-1 text-text-muted shrink-0">
            <Clock size={11} className="shrink-0 text-cat-violet" />
            <span>{config.expiracao_tempo} {config.expiracao_unidade || "h"}</span>
          </span>
        )}
      </div>

      {/* Rótulos das Ramificações / Palavras-chave */}
      {branches.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {branches.slice(0, 3).map((branch) => (
            <span
              key={branch.id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[9.5px] font-semibold text-text-muted"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-cat-violet" />
              <span className="truncate max-w-[90px]">{branch.label}</span>
            </span>
          ))}
          {branches.length > 3 && (
            <span className="rounded-md bg-cat-violet-bg px-1 py-0.5 text-[9px] font-bold text-cat-violet-fg">
              +{branches.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.match_reply}
      label={data.label}
      subtitle={describeNodeConfig("match_reply", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "match_reply", config })}
    />
  );
}
