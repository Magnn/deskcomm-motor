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
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { lerCatalogo } from "@/lib/catalogo/tipos";
import {
  ESPERA_PADRAO_DO_POS_VENDA_H,
  MAX_DEGRAUS,
  pisoEmCentavos,
  pricingSchema,
  reais,
  type PricingConfig,
} from "@/lib/preco/tipos";

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
  /** Um link por produto, uma linha cada: "Nome | https://…". */
  links: string;
}

interface Formulario {
  enabled: boolean;
  venda: string;
  referencia: string;
  referenciaReal: boolean;
  degraus: DegrauNaTela[];
  posVenda: PosVendaNaTela;
  /** Os links do valor de venda, um por produto, uma linha cada: "Nome | https://…". */
  linksDaVenda: string;
  /** Preço fixo para quem escreve de fora do Brasil. Vazio = não vende nessa moeda. */
  euro: string;
  dolar: string;
  /** As cobranças avulsas, uma linha cada: "Nome | valor | quando cobrar". */
  extras: string;
}

interface PosVendaNaTela {
  ligado: boolean;
  preco: string;
  horas: string;
  /** Um link por produto, uma linha cada: "Nome | https://…". */
  links: string;
  /** As ofertas seguintes não têm campo nesta tela: vão e voltam como vieram, para salvar não apagá-las. */
  seguintes?: NonNullable<PricingConfig["post_sale"]>["next_offers"];
}

const POS_VENDA_VAZIO: PosVendaNaTela = { ligado: false, preco: "", horas: String(ESPERA_PADRAO_DO_POS_VENDA_H), links: "" };

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
  if (!r.success) {
    return { enabled: false, venda: "", referencia: "", referenciaReal: false, degraus: [], posVenda: POS_VENDA_VAZIO, linksDaVenda: "", euro: "", dolar: "", extras: "" };
  }
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
      links: (s.product_links ?? []).map((l) => `${l.name} | ${l.url}`).join("\n"),
    })),
    posVenda: c.post_sale
      ? {
          ligado: c.post_sale.enabled,
          preco: emTexto(c.post_sale.price_cents),
          horas: String(c.post_sale.wait_hours),
          links: c.post_sale.product_links.map((l) => `${l.name} | ${l.url}`).join("\n"),
          ...(c.post_sale.next_offers ? { seguintes: c.post_sale.next_offers } : {}),
        }
      : POS_VENDA_VAZIO,
    linksDaVenda: (c.list_product_links ?? []).map((l) => `${l.name} | ${l.url}`).join("\n"),
    euro: emTexto(c.international_prices?.find((p) => p.currency === "EUR")?.price_cents),
    dolar: emTexto(c.international_prices?.find((p) => p.currency === "USD")?.price_cents),
    extras: (c.extras ?? []).map((e) => `${e.name} | ${emTexto(e.price_cents)} | ${e.when}${e.valid_days ? ` | ${e.valid_days}` : ""}`).join("\n"),
  };
}

/** "Nome | https://…" por linha. Linha sem o separador é erro, não link perdido em silêncio. */
function lerLinksPorProduto(texto: string): { links: { name: string; url: string }[] } | { erro: string } {
  const links: { name: string; url: string }[] = [];
  for (const linha of texto.split("\n")) {
    if (linha.trim() === "") continue;
    const corte = linha.indexOf("|");
    if (corte < 0) return { erro: "Cada linha dos links por trabalho deve ser: Nome | https://…" };
    links.push({ name: linha.slice(0, corte).trim(), url: linha.slice(corte + 1).trim() });
  }
  return { links };
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
    const porProduto = lerLinksPorProduto(d.links);
    if ("erro" in porProduto) return { erro: porProduto.erro };
    steps.push({
      price_cents: preco,
      ...(d.cupom.trim() !== "" ? { coupon_code: d.cupom.trim() } : {}),
      ...(d.link.trim() !== "" ? { payment_url: d.link.trim() } : {}),
      ...(porProduto.links.length > 0 ? { product_links: porProduto.links } : {}),
    });
  }
  // Pós-venda: seção vazia e desligada não vai ao servidor; preenchida, vai mesmo desligada,
  // para a pessoa não perder o que digitou ao desligar.
  let posVenda: PricingConfig["post_sale"];
  const pv = f.posVenda;
  if (pv.ligado || pv.preco.trim() !== "" || pv.links.trim() !== "") {
    const preco = emCentavos(pv.preco);
    if (preco === null) return { erro: "Informe o valor da oferta de pós-venda." };
    const horas = Number(pv.horas.trim() === "" ? ESPERA_PADRAO_DO_POS_VENDA_H : pv.horas);
    if (!Number.isInteger(horas) || horas < 0) return { erro: "A espera do pós-venda é um número inteiro de horas." };
    const porProduto = lerLinksPorProduto(pv.links);
    if ("erro" in porProduto) return { erro: porProduto.erro };
    if (porProduto.links.length === 0) return { erro: "Informe ao menos um link para a oferta de pós-venda." };
    posVenda = {
      enabled: pv.ligado,
      price_cents: preco,
      wait_hours: horas,
      product_links: porProduto.links,
      ...(pv.seguintes ? { next_offers: pv.seguintes } : {}),
    };
  }
  const daVenda = lerLinksPorProduto(f.linksDaVenda);
  if ("erro" in daVenda) return { erro: daVenda.erro };
  const internacionais: NonNullable<PricingConfig["international_prices"]> = [];
  for (const [currency, texto] of [["EUR", f.euro], ["USD", f.dolar]] as const) {
    if (texto.trim() === "") continue;
    const preco = emCentavos(texto);
    if (preco === null) return { erro: "Confira o valor para quem escreve de fora do Brasil." };
    internacionais.push({ currency, price_cents: preco });
  }
  if (internacionais.length > 0 && daVenda.links.length === 0) {
    return { erro: "Para vender em euro ou dólar, informe os links do valor de venda: é por eles que a cobrança na outra moeda é criada." };
  }
  const extras: NonNullable<PricingConfig["extras"]> = [];
  for (const linha of f.extras.split("\n")) {
    if (linha.trim() === "") continue;
    const partes = linha.split("|").map((p) => p.trim());
    const preco = emCentavos(partes[1] ?? "");
    if (partes.length < 3 || preco === null) return { erro: "Cada cobrança à parte deve ser: Nome | valor | quando cobrar" };
    // Um número inteiro no fim da linha é o período em dias ("… | 30"); sem ele, a cobrança vale uma entrega.
    const ultima = partes[partes.length - 1] ?? "";
    const temDias = partes.length >= 4 && /^\d{1,3}$/.test(ultima);
    extras.push({
      name: partes[0] ?? "",
      price_cents: preco,
      when: partes.slice(2, temDias ? -1 : undefined).join(" | "),
      ...(temDias ? { valid_days: Number(ultima) } : {}),
    });
  }
  const candidato = {
    enabled: f.enabled,
    list_price_cents: venda,
    ...(referencia !== null ? { anchor_price_cents: referencia, anchor_is_real: f.referenciaReal } : {}),
    ...(daVenda.links.length > 0 ? { list_product_links: daVenda.links } : {}),
    ...(internacionais.length > 0 ? { international_prices: internacionais } : {}),
    ...(extras.length > 0 ? { extras } : {}),
    steps,
    ...(posVenda !== undefined ? { post_sale: posVenda } : {}),
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

        <div className="flex flex-col gap-1">
          <Label htmlFor="preco-links-da-venda">{t("Links do valor de venda (uma linha por produto: Nome | https://…)")}</Label>
          <Textarea
            id="preco-links-da-venda"
            rows={3}
            placeholder={t("Nome do trabalho | https://…")}
            value={form.linksDaVenda}
            onChange={(e) => patch({ linksDaVenda: e.target.value })}
            disabled={readOnly}
          />
          <p className="text-xs text-muted-foreground">
            {t("Com eles o sistema sabe que link cobra o valor de venda: é o que permite mandar o Pix na conversa e cobrar em outra moeda.")}
          </p>
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
                placeholder="CUPOM110"
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
            <div className="flex flex-col gap-1 md:col-span-4">
              <Label htmlFor={`degrau-links-${i}`}>{t("ou um link por trabalho (uma linha cada: Nome | https://…)")}</Label>
              <Textarea
                id={`degrau-links-${i}`}
                rows={3}
                placeholder={t("Nome do trabalho | https://…")}
                value={d.links}
                onChange={(e) => mudaDegrau(i, { links: e.target.value })}
                disabled={readOnly}
              />
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
              onClick={() => patch({ degraus: [...form.degraus, { preco: "", cupom: "", link: "", links: "" }] })}
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

      <Card className="flex flex-col gap-3 p-4" data-testid="cobrancas-a-parte">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{t("Cobranças à parte")}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "O que a agente cobra além do produto principal: uma pergunta nova, um acompanhamento mais próximo. Ela diz o valor, manda o Pix na conversa e só atende depois de pago. Vale depois que a oferta principal foi apresentada. Precisa da Stripe conectada em Configurações › Pagamentos.",
            )}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="preco-extras">{t("Uma linha por cobrança: Nome | valor | quando cobrar | dias que vale (opcional)")}</Label>
          <Textarea
            id="preco-extras"
            rows={4}
            placeholder={t("Pergunta nova | 15,00 | a pessoa pede outra pergunta ou outro assunto depois da leitura gratuita.")}
            value={form.extras}
            onChange={(e) => patch({ extras: e.target.value })}
            disabled={readOnly}
          />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4" data-testid="preco-internacional">
        <div className="space-y-1">
          <h2 className="text-base font-medium">{t("Quem escreve de fora do Brasil")}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {t(
              "Preço fixo, sem negociação, para número de outro país: quem está num país do euro paga em euro, e o resto do mundo em dólar. A agente diz esse valor e manda um link de cartão nessa moeda no lugar do link em reais. Precisa da Stripe conectada em Configurações › Pagamentos. Deixe em branco para não vender na moeda.",
            )}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="preco-euro">{t("Valor em euro (€)")}</Label>
            <Input
              id="preco-euro"
              inputMode="decimal"
              placeholder="20,00"
              value={form.euro}
              onChange={(e) => patch({ euro: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="preco-dolar">{t("Valor em dólar (US$)")}</Label>
            <Input
              id="preco-dolar"
              inputMode="decimal"
              placeholder="25,00"
              value={form.dolar}
              onChange={(e) => patch({ dolar: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-4" data-testid="pos-venda">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-medium">{t("Oferta para quem já comprou")}</h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Um segundo produto, por outro valor, oferecido uma vez a quem já pagou. Só vale depois da espera abaixo, e nunca para o produto que a pessoa acabou de comprar.",
              )}
            </p>
            {lerCatalogo(config) !== null ? (
              <p className="mt-2 rounded-md bg-warning-bg px-2 py-1 text-sm text-warning-fg" data-testid="pos-venda-cede-ao-catalogo">
                {t("O catálogo deste agente está ligado: a oferta de pós-venda abaixo não vale enquanto ele estiver ligado.")}
              </p>
            ) : null}
          </div>
          <Switch
            aria-label={t("Oferta para quem já comprou")}
            checked={form.posVenda.ligado}
            onCheckedChange={(ligado) => patch({ posVenda: { ...form.posVenda, ligado } })}
            disabled={readOnly}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-venda-preco">{t("Valor da segunda oferta (R$)")}</Label>
            <Input
              id="pos-venda-preco"
              inputMode="decimal"
              placeholder="70,00"
              value={form.posVenda.preco}
              onChange={(e) => patch({ posVenda: { ...form.posVenda, preco: e.target.value } })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="pos-venda-horas">{t("Esperar quantas horas depois do pagamento")}</Label>
            <Input
              id="pos-venda-horas"
              inputMode="numeric"
              value={form.posVenda.horas}
              onChange={(e) => patch({ posVenda: { ...form.posVenda, horas: e.target.value } })}
              disabled={readOnly}
            />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <Label htmlFor="pos-venda-links">{t("Um link por produto (uma linha cada: Nome | https://…)")}</Label>
            <Textarea
              id="pos-venda-links"
              rows={4}
              placeholder={t("Nome do trabalho | https://…")}
              value={form.posVenda.links}
              onChange={(e) => patch({ posVenda: { ...form.posVenda, links: e.target.value } })}
              disabled={readOnly}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "A agente oferece uma vez, sem prazo e sem pressão, e só manda o link se a pessoa quiser. O pagamento precisa chegar pelo aviso de compra do checkout para a oferta liberar.",
          )}
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
