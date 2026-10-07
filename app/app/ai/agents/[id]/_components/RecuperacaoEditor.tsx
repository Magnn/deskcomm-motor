"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import {
  HORAS_ANTES_MAXIMO,
  MAXIMO_DE_PASSOS,
  PASSO_MAXIMO_MIN,
  RECUPERACAO_PADRAO,
  recuperacaoSchema,
  type Recuperacao,
} from "@/lib/recuperacao/config";

interface Props {
  value: Recuperacao | null;
  onChange: (value: Recuperacao | null) => void;
  disabled?: boolean;
}

type Unidade = "min" | "h";

/** Minutos redondos em horas aparecem em horas; o resto, em minutos. */
export function unidadeDoPasso(minutos: number): Unidade {
  return minutos >= 60 && minutos % 60 === 0 ? "h" : "min";
}

/**
 * Recuperação de silêncio, na tela do agente: quando chamar de novo quem parou de responder, e se a
 * conversa deve ser mantida aberta até a data que o cliente combinou. O que está aqui é exatamente o que
 * o worker lê (`followup.recovery`); as regras de quem NÃO é chamado moram em
 * `lib/agent-engine/edge/crm/recuperacao-por-silencio.ts`.
 */
export function RecuperacaoEditor({ value, onChange, disabled }: Props) {
  const t = useT();
  const ligada = value !== null && value.enabled;
  const invalida = ligada && !recuperacaoSchema.safeParse(value).success;

  function passos(steps_minutes: number[]) {
    if (value === null) return;
    onChange({ ...value, steps_minutes });
  }

  function mudarPasso(i: number, numero: number, unidade: Unidade) {
    if (value === null || !Number.isFinite(numero)) return;
    const minutos = Math.min(PASSO_MAXIMO_MIN, Math.max(1, Math.round(numero * (unidade === "h" ? 60 : 1))));
    passos(value.steps_minutes.map((m, j) => (j === i ? minutos : m)));
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <Switch
          id="recuperacao_ligada"
          checked={ligada}
          onCheckedChange={(v) => onChange(v ? { ...(value ?? RECUPERACAO_PADRAO), enabled: true } : value === null ? null : { ...value, enabled: false })}
          disabled={disabled}
        />
        <Label htmlFor="recuperacao_ligada">{t("Chamar de novo quem parou de responder")}</Label>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "Quando o cliente fica em silêncio depois de uma mensagem do agente, o agente retoma a conversa sozinho nos tempos abaixo. Ele para assim que o cliente responde, e não chama quem já combinou uma data de retorno.",
        )}
      </p>

      {ligada && value !== null ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {value.steps_minutes.map((minutos, i) => {
              const unidade = unidadeDoPasso(minutos);
              const numero = unidade === "h" ? minutos / 60 : minutos;
              return (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Label htmlFor={`recuperacao_passo_${i}`} className="w-24 text-xs">
                    {t("{n}ª chamada após").replace("{n}", String(i + 1))}
                  </Label>
                  <Input
                    id={`recuperacao_passo_${i}`}
                    type="number"
                    min={1}
                    className="w-20"
                    value={numero}
                    onChange={(e) => mudarPasso(i, Number(e.target.value), unidade)}
                    disabled={disabled}
                  />
                  {(["min", "h"] as const).map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => mudarPasso(i, numero, u)}
                      disabled={disabled}
                      aria-pressed={unidade === u}
                      className={`rounded-md border px-2 py-1 text-xs ${
                        unidade === u
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {u === "min" ? t("minutos") : t("horas")}
                    </button>
                  ))}
                  {value.steps_minutes.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => passos(value.steps_minutes.filter((_, j) => j !== i))}
                      disabled={disabled}
                    >
                      {t("Remover")}
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {value.steps_minutes.length < MAXIMO_DE_PASSOS ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const ultimo = value.steps_minutes[value.steps_minutes.length - 1] ?? 0;
                  passos([...value.steps_minutes, Math.min(PASSO_MAXIMO_MIN, Math.max(ultimo + 1, ultimo * 2))]);
                }}
                disabled={disabled || (value.steps_minutes[value.steps_minutes.length - 1] ?? 0) >= PASSO_MAXIMO_MIN}
              >
                {t("Adicionar chamada")}
              </Button>
            ) : null}
            {invalida ? (
              <p className="text-xs text-destructive">
                {t("Cada chamada precisa vir depois da anterior, e todas dentro de 23 horas.")}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center gap-2">
              <Switch
                id="recuperacao_manter_janela"
                checked={value.keep_window.enabled}
                onCheckedChange={(v) => onChange({ ...value, keep_window: { ...value.keep_window, enabled: v } })}
                disabled={disabled}
              />
              <Label htmlFor="recuperacao_manter_janela">
                {t("Manter a conversa aberta até a data que o cliente combinou")}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                "No WhatsApp oficial, o agente só pode escrever livremente por 24 horas depois da última mensagem do cliente. Quando o retorno combinado fica para depois disso, o agente manda uma mensagem pedindo uma resposta pouco antes de o prazo acabar. Se o cliente responder, ganha mais 24 horas.",
              )}
            </p>
            {value.keep_window.enabled ? (
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="recuperacao_horas_antes" className="text-xs">
                  {t("Enviar quando faltarem")}
                </Label>
                <Input
                  id="recuperacao_horas_antes"
                  type="number"
                  min={1}
                  max={HORAS_ANTES_MAXIMO}
                  className="w-20"
                  value={value.keep_window.hours_before_close}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    if (!Number.isFinite(n)) return;
                    onChange({
                      ...value,
                      keep_window: { ...value.keep_window, hours_before_close: Math.min(HORAS_ANTES_MAXIMO, Math.max(1, n)) },
                    });
                  }}
                  disabled={disabled}
                />
                <span className="text-xs text-muted-foreground">{t("horas para o prazo acabar")}</span>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {t("As chamadas respeitam os horários de envio abaixo, quando estiverem definidos.")}
          </p>
        </div>
      ) : null}
    </div>
  );
}
