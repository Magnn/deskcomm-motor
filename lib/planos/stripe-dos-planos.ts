/**
 * OS PLANOS VENDIDOS PELA STRIPE — a conta da instalação cobra a assinatura mensal de cada empresa.
 *
 * Quem paga é a EMPRESA cliente desta instalação; quem recebe é o dono da instalação, na conta Stripe
 * dele (`STRIPE_PLANS_SECRET_KEY`). Não confundir com a Stripe que cada empresa conecta para cobrar os
 * PRÓPRIOS clientes (`lib/pagamentos/stripe.ts`, Configurações › Pagamentos): lá a chave é da empresa.
 *
 * ─── O catálogo continua um só ───────────────────────────────────────────────────────
 * O plano (nome, preço, números) é o de `planosDaInstalacao()`. O preço na Stripe é criado na PRIMEIRA
 * compra e reencontrado depois pela `lookup_key` — `plano_<id>_<centavos>` —, então ninguém cadastra
 * produto no painel da Stripe, e trocar o preço no `PLANS_CATALOG` gera um preço novo sem mexer em quem
 * já paga o antigo.
 *
 * ─── Como o pagamento acha a empresa ─────────────────────────────────────────────────
 * Pelo id da organização gravado nos metadados da assinatura (`organization_id`) — nunca pelo e-mail. A
 * pessoa pode pagar com o cartão e o e-mail que quiser: o plano vai para a empresa que abriu o checkout.
 *
 * Desligado sem `STRIPE_PLANS_SECRET_KEY`: a tela de planos cai nos links da Cakto (ou em "fale com quem
 * administra"), como antes.
 */
import { env } from "@/lib/env";
import { ErroDaStripe, criarChamadaDaStripe, type ChamadaDaStripe } from "@/lib/pagamentos/stripe";

import type { Plano } from "./catalogo";

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface ConfiguracaoDaStripeDosPlanos {
  chave: string;
  /** Segredo do endereço de aviso (`whsec_…`) de `/api/v1/webhooks/stripe-planos`. Vazio = a rota responde 404. */
  segredoDoAviso: string;
}

export function configuracaoDaStripeDosPlanos(): ConfiguracaoDaStripeDosPlanos | null {
  const chave = (env.STRIPE_PLANS_SECRET_KEY ?? "").trim();
  if (!/^(sk|rk)_/.test(chave)) return null;
  return { chave, segredoDoAviso: (env.STRIPE_PLANS_WEBHOOK_SECRET ?? "").trim() };
}

export function stripeDosPlanosLigada(): boolean {
  return configuracaoDaStripeDosPlanos() !== null;
}

/** A chave estável do preço de um plano. O preço entra nela: preço novo = chave nova. */
export function chaveDoPreco(plano: Pick<Plano, "id" | "precoMensalCentavos">): string {
  return `plano_${plano.id}_${plano.precoMensalCentavos}`;
}

// ── O aviso, como regra pura ─────────────────────────────────────────────────────────

/** Situação da assinatura na Stripe → o plano está em dia aqui? `null` = ainda não decide nada. */
export function situacaoDaAssinatura(status: string): "ativa" | "inativa" | null {
  switch (status) {
    case "active":
    case "trialing":
      return "ativa";
    case "past_due":
    case "unpaid":
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "inativa";
    // `incomplete`: o primeiro pagamento ainda não passou (3-D Secure, boleto em aberto). Não liga nem
    // derruba — o aviso seguinte decide.
    default:
      return null;
  }
}

export interface AssinaturaDaStripe {
  id: string;
  status: string;
  clienteId: string | null;
  organizationId: string | null;
  /** O plano pelo preço cobrado (metadado do preço; senão a `lookup_key`). */
  planoId: string | null;
  itemId: string | null;
}

const FORMA_DO_PLANO = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Lê o objeto `subscription` da Stripe (do aviso ou da API) no formato que a regra usa. */
export function lerAssinaturaDaStripe(objeto: Record<string, unknown>): AssinaturaDaStripe | null {
  const id = texto(objeto.id);
  if (!id || !id.startsWith("sub_")) return null;
  const metadados = (objeto.metadata ?? {}) as Record<string, unknown>;
  const itens = ((objeto.items ?? {}) as { data?: unknown }).data;
  const item = Array.isArray(itens) ? ((itens[0] ?? null) as Record<string, unknown> | null) : null;
  const preco = (item?.price ?? null) as Record<string, unknown> | null;
  const doPreco = texto(((preco?.metadata ?? {}) as Record<string, unknown>).plan_id);
  const daChave = texto(preco?.lookup_key)?.match(/^plano_([a-z0-9][a-z0-9_-]{0,39})_\d+$/)?.[1] ?? null;
  const planoId = [doPreco, daChave, texto(metadados.plan_id)].find((p) => p !== null && FORMA_DO_PLANO.test(p)) ?? null;
  const cliente = objeto.customer;
  return {
    id,
    status: texto(objeto.status) ?? "",
    clienteId: typeof cliente === "string" ? cliente : texto((cliente as { id?: unknown } | null)?.id),
    organizationId: texto(metadados.organization_id),
    planoId,
    itemId: texto(item?.id),
  };
}

// ── As chamadas ──────────────────────────────────────────────────────────────────────

export function criarStripeDosPlanos(cfg: Pick<ConfiguracaoDaStripeDosPlanos, "chave">, opts: { fetch?: Fetch } = {}) {
  const chamar: ChamadaDaStripe = criarChamadaDaStripe({ chave: cfg.chave }, opts);

  /** O preço mensal do plano na Stripe — reencontrado pela chave, ou criado agora (com o produto). */
  async function precoDoPlano(plano: Plano): Promise<string> {
    const chave = chaveDoPreco(plano);
    const achados = await chamar("GET", `/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(chave)}`);
    const existente = Array.isArray(achados.data) ? (achados.data[0] as { id?: unknown } | undefined) : undefined;
    if (typeof existente?.id === "string") return existente.id;

    // Idempotência pela chave: dois cliques ao mesmo tempo no primeiro checkout criam UM preço.
    const preco = await chamar(
      "POST",
      "/prices",
      {
        currency: "brl",
        unit_amount: plano.precoMensalCentavos,
        "recurring[interval]": "month",
        lookup_key: chave,
        "product_data[name]": `Plano ${plano.nome}`,
        "product_data[metadata][plan_id]": plano.id,
        "metadata[plan_id]": plano.id,
      },
      `preco-${chave}`,
    );
    if (typeof preco.id !== "string") throw new ErroDaStripe("recusada", "a Stripe criou o preço sem id");
    return preco.id;
  }

  return {
    precoDoPlano,

    /** A página de pagamento da Stripe para assinar o plano. Devolve o endereço para onde mandar a pessoa. */
    async criarCheckout(p: {
      plano: Plano;
      organizationId: string;
      email: string | null;
      clienteId: string | null;
      sucesso: string;
      cancelado: string;
    }): Promise<string> {
      const preco = await precoDoPlano(p.plano);
      const campos: Record<string, string | number | boolean> = {
        mode: "subscription",
        "line_items[0][price]": preco,
        "line_items[0][quantity]": 1,
        client_reference_id: p.organizationId,
        success_url: p.sucesso,
        cancel_url: p.cancelado,
        locale: "pt-BR",
        allow_promotion_codes: true,
        "metadata[organization_id]": p.organizationId,
        "metadata[plan_id]": p.plano.id,
        "subscription_data[metadata][organization_id]": p.organizationId,
        "subscription_data[metadata][plan_id]": p.plano.id,
      };
      if (p.clienteId) campos.customer = p.clienteId;
      else if (p.email) campos.customer_email = p.email;
      const sessao = await chamar("POST", "/checkout/sessions", campos);
      if (typeof sessao.url !== "string" || !sessao.url.startsWith("https://")) {
        throw new ErroDaStripe("recusada", "a Stripe abriu o checkout sem endereço");
      }
      return sessao.url;
    },

    async lerAssinatura(id: string): Promise<AssinaturaDaStripe | null> {
      return lerAssinaturaDaStripe(await chamar("GET", `/subscriptions/${encodeURIComponent(id)}`));
    },

    /**
     * Troca o plano de uma assinatura que já existe — sem segundo checkout e sem segunda cobrança mensal.
     * A Stripe cobra (ou credita) a diferença proporcional na próxima fatura.
     */
    async trocarPlano(assinatura: AssinaturaDaStripe, plano: Plano): Promise<AssinaturaDaStripe | null> {
      if (!assinatura.itemId) throw new ErroDaStripe("recusada", "a assinatura não tem item para trocar");
      const preco = await precoDoPlano(plano);
      const r = await chamar("POST", `/subscriptions/${encodeURIComponent(assinatura.id)}`, {
        "items[0][id]": assinatura.itemId,
        "items[0][price]": preco,
        proration_behavior: "create_prorations",
        "metadata[plan_id]": plano.id,
      });
      return lerAssinaturaDaStripe(r);
    },

    /** O portal da Stripe: cartão, faturas e cancelamento, sem tela nossa para cada coisa. */
    async criarPortal(clienteId: string, retorno: string): Promise<string> {
      const campos = { customer: clienteId, return_url: retorno, locale: "pt-BR" };
      let sessao: Record<string, unknown>;
      try {
        sessao = await chamar("POST", "/billing_portal/sessions", campos);
      } catch (e) {
        // Conta que nunca salvou a configuração do portal no painel: criamos uma e tentamos de novo.
        if (!(e instanceof ErroDaStripe) || e.codigo !== "recusada" || !/configuration/i.test(e.message)) throw e;
        await chamar("POST", "/billing_portal/configurations", {
          "business_profile[headline]": "Sua assinatura",
          "features[invoice_history][enabled]": true,
          "features[payment_method_update][enabled]": true,
          "features[subscription_cancel][enabled]": true,
          "features[subscription_cancel][mode]": "at_period_end",
          "features[customer_update][enabled]": true,
          "features[customer_update][allowed_updates][0]": "email",
          "features[customer_update][allowed_updates][1]": "tax_id",
        });
        sessao = await chamar("POST", "/billing_portal/sessions", campos);
      }
      if (typeof sessao.url !== "string" || !sessao.url.startsWith("https://")) {
        throw new ErroDaStripe("recusada", "a Stripe abriu o portal sem endereço");
      }
      return sessao.url;
    },
  };
}
