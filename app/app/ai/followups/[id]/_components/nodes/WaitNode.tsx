"use client";

import type { NodeProps } from "@xyflow/react";

import type { RFNode } from "@/lib/followup/graph-mappers";
import { Clock } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";
import type { ConfigOf } from "../forms/shared";
import { NODE_VISUALS } from "./nodeVisuals";
import { NodeCard } from "./NodeCard";

export function formatarTempoEspera(c: ConfigOf<"wait">): string {
  if (c.mode === "fixed") {
    const ms = c.duration_ms;
    if (ms >= 86_400_000 && ms % 86_400_000 === 0) {
      const dias = ms / 86_400_000;
      return `${dias} ${dias === 1 ? "dia" : "dias"}`;
    }
    if (ms >= 3_600_000 && ms % 3_600_000 === 0) {
      const horas = ms / 3_600_000;
      return `${horas} ${horas === 1 ? "hora" : "horas"}`;
    }
    if (ms >= 60_000 && ms % 60_000 === 0) {
      const minutos = ms / 60_000;
      return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
    }
    if (ms >= 60_000) {
      const minutos = Math.round(ms / 60_000);
      return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
    }
    const seg = Math.max(1, Math.round(ms / 1_000));
    return `${seg} ${seg === 1 ? "segundo" : "segundos"}`;
  }

  // Modo Inteligente (Smart)
  const minMs = c.min_ms;
  const maxMs = c.max_ms;

  if (minMs >= 3_600_000 && maxMs >= 3_600_000 && minMs % 3_600_000 === 0 && maxMs % 3_600_000 === 0) {
    const minH = minMs / 3_600_000;
    const maxH = maxMs / 3_600_000;
    return `${minH} a ${maxH} ${maxH === 1 ? "hora" : "horas"}`;
  }
  if (minMs >= 86_400_000 && maxMs >= 86_400_000 && minMs % 86_400_000 === 0 && maxMs % 86_400_000 === 0) {
    const minD = minMs / 86_400_000;
    const maxD = maxMs / 86_400_000;
    return `${minD} a ${maxD} ${maxD === 1 ? "dia" : "dias"}`;
  }
  const minMin = Math.round(minMs / 60_000);
  const maxMin = Math.round(maxMs / 60_000);
  return `${minMin} a ${maxMin} minutos`;
}

export function WaitNode({ id, data, selected }: NodeProps<RFNode>) {
  const t = useT();
  const c = data.config as ConfigOf<"wait">;
  const tempoTexto = formatarTempoEspera(c);

  const customPreview = (
    <div className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface-elevated p-2.5 shadow-2xs">
      <div className="flex items-center justify-center gap-2 rounded-md border border-border-strong bg-surface-elevated py-2.5 px-3 text-xs font-semibold text-text-muted">
        <Clock size={15} className="shrink-0 text-text-muted" aria-hidden />
        <span>Aguardar o prazo de {tempoTexto}</span>
      </div>
      <div className="flex items-center gap-2 px-1 text-[11px] font-medium text-text-muted">
        <div className="h-2 w-2 shrink-0 rounded-full bg-cat-blue" />
        <span>{t("Após esse tempo o fluxo prosseguirá.")}</span>
      </div>
    </div>
  );

  return (
    <NodeCard
      id={id}
      visual={NODE_VISUALS.wait}
      label={data.label || "Delay"}
      subtitle={tempoTexto}
      selected={selected}
      errors={data.errors}
      simulating={data.simulating}
      customPreview={customPreview}
    />
  );
}
