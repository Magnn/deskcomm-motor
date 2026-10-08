"use client";

import { useState } from "react";
import { UserCheck, Clock } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { attendantRouteConfigSchema } from "@/lib/followup/graph-schema";
import { cn } from "@/lib/utils";

import type { ConfigOf } from "./shared";

export function AttendantRouteForm({
  config,
  onChange,
}: {
  config: ConfigOf<"attendant_route">;
  onChange: (config: ConfigOf<"attendant_route">) => void;
}) {
  const t = useT();
  const { data: agentes = [] } = useAgentsList();

  const [maxWait, setMaxWait] = useState(config.max_wait_minutes ?? 30);
  const [attendantIds, setAttendantIds] = useState<string[]>(config.attendant_ids ?? []);
  const [autoFollow, setAutoFollow] = useState(config.auto_follow ?? true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = (patch: {
    max_wait_minutes?: number;
    attendant_ids?: string[];
    auto_follow?: boolean;
  }) => {
    const nextWait = patch.max_wait_minutes !== undefined ? patch.max_wait_minutes : maxWait;
    const nextAttendants =
      patch.attendant_ids !== undefined ? patch.attendant_ids : attendantIds;
    const nextAutoFollow =
      patch.auto_follow !== undefined ? patch.auto_follow : autoFollow;

    const candidate = {
      max_wait_minutes: nextWait,
      attendant_ids: nextAttendants,
      auto_follow: nextAutoFollow,
    };

    const parsed = attendantRouteConfigSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? t("Configuração inválida."));
      return;
    }
    setError(null);
    onChange(parsed.data);
  };

  const toggleAttendant = (id: string) => {
    const next = attendantIds.includes(id)
      ? attendantIds.filter((item) => item !== id)
      : [...attendantIds, id];
    setAttendantIds(next);
    commit({ attendant_ids: next });
  };

  const handleToggleAutoFollow = (value: boolean) => {
    setAutoFollow(value);
    commit({ auto_follow: value });
  };

  return (
    <div className="space-y-4 font-sans text-xs">
      {/* Subtítulo AcassIA */}
      <p className="text-xs text-text-muted leading-relaxed">
        {t("Selecione quais atendentes do workspace participarão da distribuição. Em tempo de execução, apenas atendentes com presença ")}
        <strong className="font-bold text-text">
          {t("disponível")}
        </strong>{" "}
        {t("entram na disputa.")}
      </p>

      {/* Lista de Atendentes ou Empty State */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-2xs">
        {agentes.length === 0 ? (
          <p className="text-xs text-text-muted text-center py-2">
            {t("Nenhum atendente encontrado neste workspace.")}
          </p>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {agentes.map((agente: { id: string; name: string; email?: string }) => {
              const isSelected = attendantIds.includes(agente.id);
              return (
                <label
                  key={agente.id}
                  className={cn(
                    "flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                    isSelected
                      ? "border-cat-violet/30 bg-cat-violet-bg"
                      : "border-border hover:border-border"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-cat-violet-bg flex items-center justify-center text-cat-violet-fg font-bold text-xs shrink-0">
                      {agente.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text truncate">
                        {agente.name}
                      </p>
                      {agente.email && (
                        <p className="text-[10px] text-text-subtle truncate">
                          {agente.email}
                        </p>
                      )}
                    </div>
                  </div>

                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleAttendant(agente.id)}
                    className="w-4 h-4 rounded-sm text-[#9333ea] focus:ring-cat-violet border-border-strong cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Card: Tornar automaticamente seguidor do contato */}
      <div className="rounded-xl border border-border bg-surface p-3.5 shadow-2xs flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-text">
          {t("Tornar automaticamente seguidor do contato")}
        </span>

        <button
          type="button"
          role="switch"
          aria-checked={autoFollow}
          onClick={() => handleToggleAutoFollow(!autoFollow)}
          className={cn(
            "w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0",
            autoFollow ? "bg-[#9333ea]" : "bg-border-strong"
          )}
        >
          <span
            className={cn(
              "w-4 h-4 rounded-full bg-surface transition-transform absolute top-1 left-1 shadow-xs",
              autoFollow && "translate-x-5"
            )}
          />
        </button>
      </div>

      {/* Opções avançadas (Prazo máximo) */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-[11px] font-semibold text-text-subtle hover:text-text-muted flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Clock size={12} />
          <span>{t("Configurações avançadas")}</span>
        </button>

        {showAdvanced && (
          <div className="mt-2.5 space-y-2 p-3 rounded-xl border border-border bg-surface-elevated">
            <Label htmlFor="attendant-route-wait" className="text-xs font-semibold">
              {t("Prazo máximo de espera (minutos)")}
            </Label>
            <Input
              id="attendant-route-wait"
              type="number"
              min={5}
              max={1440}
              value={maxWait}
              onChange={(event) => {
                const next = Number(event.target.value);
                setMaxWait(next);
                commit({ max_wait_minutes: next });
              }}
              className="h-9 rounded-lg border-border text-xs"
            />
            <p className="text-[11px] text-text-subtle">
              {t("Usa o rodízio configurado no canal e só continua após a atribuição ser confirmada.")}
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-cat-red font-medium">{error}</p>}
    </div>
  );
}
