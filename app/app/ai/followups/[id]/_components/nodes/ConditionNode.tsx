"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { nodeBranches } from "@/lib/followup/graph-schema";
import { fraseDaCondicao } from "@/lib/followup/vocabulario";
import { useT } from "@/hooks/i18n/useT";
import { useEtapasDoFluxo } from "../EtapasDoFluxo";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS, describeNodeConfig } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

const REGRAS_NO_CARD = 3;

/**
 * Cada regra aparece pela frase do vocabulário (`fraseDaCondicao`), a mesma do
 * painel e do publish — com o operador e o nome da etapa reais. Antes o card
 * dizia "Validar se o campo <campo cru> é igual a" para QUALQUER operador, e
 * um valor 0 aparecia como "vazio".
 */
export function ConditionNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const { nomes } = useEtapasDoFluxo();
  const config = data.config as ConfigOf<"condition">;
  const checks = config.checks ?? [];
  const logicText =
    config.combinator === "or" ? t("Qualquer condição é verdadeira:") : t("Todas as condições são verdadeiras:");
  const restantes = checks.length - REGRAS_NO_CARD;

  const customPreview = (
    <div className="flex w-full flex-col gap-1 rounded-lg border border-border/60 bg-surface-elevated p-1.5">
      <div className="flex min-h-[40px] flex-col gap-2 rounded-md border border-dashed border-error/40 bg-error-bg p-2.5">
        {config.branching !== "per_check" && (
          <div className="w-full text-center text-[11px] font-semibold leading-tight text-text">{logicText}</div>
        )}
        <div className="flex w-full flex-col gap-1.5">
          {checks.length > 0 ? (
            checks.slice(0, REGRAS_NO_CARD).map((check, i) => (
              <div
                key={check.id ?? i}
                className="rounded-md border border-dashed border-border bg-surface px-2 py-1 text-[10px] leading-snug font-medium text-text"
              >
                {fraseDaCondicao(check.field, check.op, check.value, nomes)}
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dotted border-border px-2 py-1 text-[10px] text-text-muted">
              {t("Sem condições")}
            </div>
          )}
          {restantes > 0 && (
            <div className="text-center text-[10px] font-medium text-text-muted">{`+${restantes}`}</div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.condition}
      label={data.label}
      subtitle={describeNodeConfig("condition", data.config, t)}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
      branches={nodeBranches({ type: "condition", config })}
    />
  );
}
