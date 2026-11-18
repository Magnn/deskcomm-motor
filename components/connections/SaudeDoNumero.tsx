"use client";
/**
 * Saúde do número no rodízio — a mesma nota que `lib/plataformas-de-anuncio/saude-do-numero.ts`
 * usa para escolher para onde vai o próximo lead. Aparece no cartão de cada conexão (a visão de
 * todos os números juntos) e na ficha de Proteção de envio (o detalhe dos sinais).
 */
import type { PacingHealthView, PacingKnobsItem } from "@/hooks/channels/usePacingKnobs";
import { useT } from "@/hooks/i18n/useT";

const COR_DA_NOTA: Record<PacingHealthView["rotation"], string> = {
  inteiro: "text-emerald-600 dark:text-emerald-400",
  metade: "text-amber-600 dark:text-amber-400",
  descansa: "text-red-600 dark:text-red-400",
};

function useEfeitoNoRodizio() {
  const t = useT();
  return (rotation: PacingHealthView["rotation"]) =>
    rotation === "descansa"
      ? t("descansando no rodízio")
      : rotation === "metade"
        ? t("recebe metade dos leads")
        : t("recebe leads normalmente");
}

/** Uma linha para o cartão: leads de hoje, ritmo da hora e nota. Some sem dado. */
export function ResumoDoNumeroHoje({ item }: { item: PacingKnobsItem | undefined }) {
  const t = useT();
  const efeito = useEfeitoNoRodizio();
  if (!item?.today) return null;
  const { today, health, leads } = item;
  return (
    <p className="text-xs text-text-muted" data-testid="resumo-do-numero-hoje">
      {t("Hoje:")} <strong className="text-text">{today.leads_today}</strong>
      {leads.cap_today != null ? `/${leads.cap_today}` : ""} {t("leads")} · {today.sent_last_hour} {t("msgs na última hora")}
      {health ? (
        <>
          {" · "}
          <span className={COR_DA_NOTA[health.rotation]}>
            {t("saúde")} {health.score} ({efeito(health.rotation)})
          </span>
        </>
      ) : null}
    </p>
  );
}

/** O detalhe para a ficha: a nota, o efeito e os sinais que a formaram. */
export function DetalheDaSaude({ health, picoHora }: { health: PacingHealthView | null; picoHora: number }) {
  const t = useT();
  const efeito = useEfeitoNoRodizio();
  if (!health) return null;
  return (
    <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground" data-testid="saude-do-numero">
      <p>
        {t("Saúde do número:")}{" "}
        <strong className={COR_DA_NOTA[health.rotation]}>
          {health.score}/100 · {efeito(health.rotation)}
        </strong>
      </p>
      <ul className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
        <li>
          {t("Quedas em 72 h:")} <strong className="text-foreground">{health.drops_72h}</strong>
        </li>
        <li>
          {t("Pico em 24 h:")} <strong className="text-foreground">{picoHora}</strong> {t("msgs/h")}
        </li>
        <li>
          {t("Envios que falharam (24 h):")} <strong className="text-foreground">{health.failed_24h}</strong>/{health.sent_24h}
        </li>
        <li>
          {t("Leads que sumiram (72 h):")} <strong className="text-foreground">{health.gone_leads_72h}</strong>/{health.leads_72h}
        </li>
      </ul>
      <p className="mt-1">
        {t("Abaixo de 60 o número recebe metade dos leads; abaixo de 30 descansa até melhorar. O número oficial recebe antes dos de QR.")}
      </p>
    </div>
  );
}
