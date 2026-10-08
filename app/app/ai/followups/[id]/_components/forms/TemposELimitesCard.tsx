"use client";

import { HelpCircle } from "lucide-react";
import { useT } from "@/hooks/i18n/useT";

export interface TemposELimitesProps {
  agruparSegundos: number;
  onAgruparChange: (segundos: number) => void;
  expiracaoTempo: number;
  onExpiracaoTempoChange: (tempo: number) => void;
  expiracaoUnidade: "segundos" | "minutos" | "horas" | "dias";
  onExpiracaoUnidadeChange: (
    unidade: "segundos" | "minutos" | "horas" | "dias"
  ) => void;
}

export function TemposELimitesCard({
  agruparSegundos,
  onAgruparChange,
  expiracaoTempo,
  onExpiracaoTempoChange,
  expiracaoUnidade,
  onExpiracaoUnidadeChange,
}: TemposELimitesProps) {
  const t = useT();

  return (
    <div className="space-y-3 font-sans text-xs">
      {/* Divisor: Tempos e limites */}
      <div className="relative flex items-center justify-center my-3">
        <div className="w-full border-t border-border" />
        <span className="absolute bg-surface px-3 text-[11px] text-text-subtle font-medium">
          {t("Tempos e limites")}
        </span>
      </div>

      {/* Card 1: Agrupar respostas */}
      <div className="rounded-xl border border-border bg-surface p-3 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-text">
              {t("Agrupar respostas")}
            </span>
            <span className="rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] px-2 py-0.5 text-[10px] font-medium">
              {t("a partir da 1ª mensagem")}
            </span>
            <span
              title={t("Reinicia a cada nova mensagem recebida.")}
              className="text-text-subtle hover:text-text-muted cursor-help"
            >
              <HelpCircle size={13} />
            </span>
          </div>
        </div>

        <p className="text-[11px] text-text-subtle">
          {t("Reinicia a cada nova mensagem recebida.")}
        </p>

        <select
          value={agruparSegundos}
          onChange={(e) => onAgruparChange(Number(e.target.value))}
          className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden cursor-pointer"
        >
          <option value={15}>{t("15 segundos (padrão)")}</option>
          <option value={30}>{t("30 segundos")}</option>
          <option value={45}>{t("45 segundos")}</option>
          <option value={60}>{t("1 minuto")}</option>
          <option value={120}>{t("2 minutos")}</option>
          <option value={300}>{t("5 minutos")}</option>
          <option value={0}>{t("Não agrupar (resposta única)")}</option>
        </select>
      </div>

      {/* Card 2: Expiração do bloco */}
      <div className="rounded-xl border border-border bg-surface p-3 space-y-2 shadow-2xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[12.5px] font-bold text-text">
              {t("Expiração do bloco")}
            </span>
            <span className="rounded-full bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] px-2 py-0.5 text-[10px] font-medium">
              {t("a partir do envio")}
            </span>
            <span
              title={t("Tempo máximo aguardando a interação do contato.")}
              className="text-text-subtle hover:text-text-muted cursor-help"
            >
              <HelpCircle size={13} />
            </span>
          </div>
        </div>

        <p className="text-[11px] text-text-subtle">
          {t("Tempo máximo aguardando a interação do contato.")}
        </p>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="number"
            min={1}
            value={expiracaoTempo}
            onChange={(e) =>
              onExpiracaoTempoChange(Math.max(1, Number(e.target.value) || 1))
            }
            className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text focus:outline-hidden"
          />
          <select
            value={expiracaoUnidade}
            onChange={(e) =>
              onExpiracaoUnidadeChange(
                e.target.value as "segundos" | "minutos" | "horas" | "dias"
              )
            }
            className="w-full h-10 rounded-lg border border-border bg-surface px-3 text-xs text-text-muted focus:outline-hidden cursor-pointer"
          >
            <option value="horas">{t("Horas")}</option>
            <option value="minutos">{t("Minutos")}</option>
            <option value="dias">{t("Dias")}</option>
            <option value="segundos">{t("Segundos")}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
