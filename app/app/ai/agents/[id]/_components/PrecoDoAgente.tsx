"use client";
/**
 * A aba "Preço": o valor real, o valor de referência e até onde a agente pode negociar.
 *
 * Três coisas que a tela existe para deixar visíveis:
 *  - o degrau de negociação carrega COMO se paga aquele valor (cupom ou link): a agente não
 *    muda o que o checkout cobra, então um valor sem forma de pagar não pode ser oferecido;
 *  - o ÚLTIMO degrau é o mínimo, e a trava de promessas veta qualquer mensagem que cite
 *    valor abaixo dele;
 *  - o valor de referência só entra com a confirmação de que é um preço real da oferta — um
 *    "de R$ X por R$ Y" cujo X nunca foi cobrado é desconto falso.
 *
 * A configuração mora em `ai_agents.config.pricing` e vale no PRÓXIMO turno, sem publicar.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { MAX_DEGRAUS, pisoEmCentavos, pricingSchema, reais, type PricingConfig } from "@/lib/preco/tipos";

interface Props {
  agentId: string;
  /** `ai_agents.config` como veio do banco. */
  config: Record<string, unknown> | null | undefined;
  readOnly?: boolean;
}

interface DegrauNaTela {
  preco: string;
  cupom: string;
  link: string;
}

interface Formulario {
  enabled: boolean;
  venda: string;
  referencia: string;
  referenciaReal: boolean;
  degraus: DegrauNaTela[];
}

const emCentavos = (texto: string): number | null => {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const emTexto = (centavos: number | undefined): string =>
  centavos === undefined ? "" : (centavos / 100).toFixed(2).replace(".", ",");

function formularioInicial(config: Props["config"]): Formulario {
  const bruto = (config as { pricing?: unknown } | null | undefined)?.pricing;
  const r = pricingSchema.safeParse(bruto);
  if (!r.success) return { enabled: false, venda: "", referencia: "", referenciaReal: false, degraus: [] };
  const c = r.data;
  return {
    enabled: c.enabled,
    venda: emTexto(c.list_price_cents),
    referencia: emTexto(c.anchor_price_cents),
    referenciaReal: c.anchor_is_real === true,
    degraus: c.steps.map((s) => ({
      preco: emTexto(s.price_cents),
      cupom: s.coupon_code ?? "",
      link: s.payment_url ?? "",
    })),
  };
}

/** O que o servidor recebe. `null` + mensagem quando a tela ainda não tem o que mandar. */
function paraCorpo(f: Formulario): { corpo: PricingConfig } | { erro: string } {
  const venda = emCentavos(f.venda);
  if (venda === null) return { erro: "Informe o valor de venda." };
  const referencia = emCentavos(f.referencia);
  const steps = [];
  for (const d of f.degraus) {
    const preco = emCentavos(d.preco);
    if (preco === null) return { erro: "Informe o valor de cada degrau." };
    steps.push({
      price_cents: preco,
      ...(d.cupom.trim() !== "" ? { coupon_code: d.cupom.trim() } : {}),
      ...(d.link.trim() !== "" ? { payment_url: d.link.trim() } : {}),
    });
  }
  const candidato = {
    enabled: f.enabled,
    list_price_cents: venda,
    ...(referencia !== null ? { anchor_price_cents: referencia, anchor_is_real: f.referenciaReal } : {}),
    steps,
  };
  const r = pricingSchema.safeParse(candidato);
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os valores." };
  return { corpo: r.data };
}

export function PrecoDoAgente({ agentId, config, readOnly }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = React.useState<Formulario>(() => formularioInicial(config));
  const [salvando, setSalvando] = React.useState(false);
  const patch = (p: Partial<Formulario>) => setForm((f) => ({ ...f, ...p }));
  const mudaDegrau = (i: number, p: Partial<DegrauNaTela>) =>
    setForm((f) => ({ ...f, degraus: f.degraus.map((d, j) => (j === i ? { ...d, ...p } : d)) }));

  const previa = paraCorpo(form);
  const piso = "corpo" in previa ? pisoEmCentavos(previa.corpo) : null;

  const salvar = async () => {
    const r = paraCorpo(form);
    if ("erro" in r) {
      toast.error(t(r.erro));
      return;
    }
    setSalvando(true);
    try {
      await apiClient.put(`/api/v1/ai/agents/${agentId}/pricing`, r.corpo);
      await qc.invalidateQueries({ queryKey: ["ai", "agents"] });
      toast.success(
        form.enabled
          ? t("Preço salvo. Vale a partir da próxima conversa.")
          : t("Negociação desligada. A agente volta a não dar desconto."),
      );
    } catch (err) {
      showApiError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="preco-do-agente">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-medium">{t("Preço e negociação")}</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t(
                "Defina o valor de venda e, se quiser, até onde a agente pode negociar. Sem isto ligado, ela não dá desconto. Vale a partir da próxima conversa, sem publicar versão.",
              )}
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
            disabled={readOnly}
            aria-label={t("Usar esta política de preço")}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="preco-venda">{t("Valor de venda (R$)")}</Label>
            <Input
              id="preco-venda"
              inputMode="decimal"
              placeholder="130,00"
              value={form.venda}
              onChange={(e) => patch({ venda: e.target.value })}
              disabled={readOnly}
            />
            <p className="text-xs text-muted-foreground">{t("É o que o link de pagamento cobra.")}</p>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="preco-referencia">{t("Valor de referência (R$, opcional)")}</Label>
            <Input
              id="preco-referencia"
              inputMode="decimal"
              placeholder="260,00"
              value={form.referencia}
              onChange={(e) => patch({ referencia: e.target.value })}
              disabled={readOnly}
            />
            <p className="text-xs text-muted-foreground">
              {t("O preço cheio. A agente o cita uma vez, como “valor de referência”, sem prazo nem pressão.")}
            </p>
          </div>
        </div>

        {form.referencia.trim() !== "" ? (
          <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.referenciaReal}
              onChange={(e) => patch({ referenciaReal: e.target.checked })}
              disabled={readOnly}
            />
            <span>
              {t(
                "Confirmo que este é um preço real da oferta (já praticado ou vendido por este valor). Um “de R$ X por R$ Y” em que o X nunca foi cobrado é desconto falso e pode ser publicidade enganosa.",
              )}
            </span>
          </label>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{t("Negociação em degraus")}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "A agente só oferece desconto se a pessoa pedir ou disser que está caro, e um degrau por vez, na ordem. Cada degrau precisa dizer como se paga aquele valor: um cupom do checkout ou um link que já cobra o valor. O último degrau é o mínimo.",
            )}
          </p>
        </div>

        {form.degraus.map((d, i) => (
          <div key={i} className="grid gap-2 rounded-md border p-3 md:grid-cols-[8rem_1fr_1fr_auto]">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`degrau-preco-${i}`}>{t("Valor (R$)")}</Label>
              <Input
                id={`degrau-preco-${i}`}
                inputMode="decimal"
                value={d.preco}
                onChange={(e) => mudaDegrau(i, { preco: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`degrau-cupom-${i}`}>{t("Cupom no checkout")}</Label>
              <Input
                id={`degrau-cupom-${i}`}
                placeholder="ESMERALDA110"
                value={d.cupom}
                onChange={(e) => mudaDegrau(i, { cupom: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`degrau-link-${i}`}>{t("ou link que cobra este valor")}</Label>
              <Input
                id={`degrau-link-${i}`}
                placeholder="https://…"
                value={d.link}
                onChange={(e) => mudaDegrau(i, { link: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={readOnly}
                onClick={() => patch({ degraus: form.degraus.filter((_, j) => j !== i) })}
              >
                {t("Remover")}
              </Button>
            </div>
            {i === form.degraus.length - 1 ? (
              <p className="text-xs text-muted-foreground md:col-span-4">{t("Este é o mínimo: a agente nunca desce dele.")}</p>
            ) : null}
          </div>
        ))}

        <p className="text-xs text-muted-foreground">
          {t("Dica: um degrau só (o mínimo) funciona melhor que vários — com vários, a agente às vezes pula os intermediários.")}
        </p>

        {form.degraus.length < MAX_DEGRAUS ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={readOnly}
              onClick={() => patch({ degraus: [...form.degraus, { preco: "", cupom: "", link: "" }] })}
            >
              {t("Adicionar degrau")}
            </Button>
          </div>
        ) : null}

        <p className="text-sm" data-testid="resumo-do-preco">
          {piso !== null
            ? `${t("Mínimo que a agente aceita:")} ${reais(piso)}.`
            : t("Preencha os valores para ver o mínimo que a agente aceita.")}
        </p>
      </Card>

      {!readOnly ? (
        <div className="flex justify-end">
          <Button type="button" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? t("Salvando…") : t("Salvar preço")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
