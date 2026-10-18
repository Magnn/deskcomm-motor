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

/**
 * O nome que a fatura do cartão mostra para a ASSINATURA — o `statement_descriptor` do produto do plano.
 *
 * Existe porque a mesma conta Stripe pode cobrar coisas diferentes: os planos desta instalação e as
 * vendas do próprio dono (Pix, boleto, link de cartão), que saem com o nome padrão da conta. Sem isto,
 * quem assina o sistema lê no extrato o nome da empresa-mãe e não reconhece a cobrança — e cobrança não
 * reconhecida vira contestação. O nome vem da marca da instalação (`marcaDaSaida(null)`).
 *
 * Regras da Stripe para o campo: 5 a 22 caracteres, só alfabeto latino, ao menos uma letra e nenhum de
 * `< > \ ' " *`. Nome que não cabe nelas devolve `null` e o produto fica sem o campo (vale o da conta) —
 * mandar um nome recusado faria a Stripe recusar o PREÇO, e ninguém conseguiria assinar.
 */
export function nomeNoExtrato(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .,&-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 22)
    .trim();
  return limpo.length >= 5 && /[A-Z]/.test(limpo) ? limpo : null;
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
  /** O item do PLANO (o preço mensal) — nunca o do excedente. */
  itemId: string | null;
  /** O item da cobrança do excedente de conversas, quando a assinatura já o tem. */
  itemDoExcedente: string | null;
  /** O ciclo de cobrança em curso (onde a Stripe soma o medidor). */
  cicloInicio: Date | null;
  cicloFim: Date | null;
}

/** Prefixo da `lookup_key` do preço do excedente — é por ele que o item do excedente se distingue do plano. */
export const PREFIXO_DO_EXCEDENTE = "excedente_conversa_";
/** O nome do evento do medidor na Stripe. */
export const EVENTO_DO_EXCEDENTE = "conversas_excedentes";

function chaveDoPrecoDoItem(item: Record<string, unknown>): string | null {
  return texto(((item.price ?? null) as Record<string, unknown> | null)?.lookup_key);
}

function instante(v: unknown): Date | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? new Date(v * 1000) : null;
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
  const todos = (Array.isArray(itens) ? itens : []) as Record<string, unknown>[];
  const ehExcedente = (i: Record<string, unknown>) => chaveDoPrecoDoItem(i)?.startsWith(PREFIXO_DO_EXCEDENTE) === true;
  // O item do plano é o que NÃO é o excedente: depois que o excedente entra, a ordem dos itens não é garantia.
  const item = todos.find((i) => !ehExcedente(i)) ?? null;
  const doExcedente = todos.find(ehExcedente) ?? null;
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
    itemDoExcedente: texto(doExcedente?.id),
    // Versões novas da API põem o ciclo no item; as antigas, na assinatura.
    cicloInicio: instante(item?.current_period_start) ?? instante(objeto.current_period_start),
    cicloFim: instante(item?.current_period_end) ?? instante(objeto.current_period_end),
  };
}

// ── As chamadas ──────────────────────────────────────────────────────────────────────

export function criarStripeDosPlanos(
  cfg: Pick<ConfiguracaoDaStripeDosPlanos, "chave"> & { marca?: string | null },
  opts: { fetch?: Fetch } = {},
) {
  const chamar: ChamadaDaStripe = criarChamadaDaStripe({ chave: cfg.chave }, opts);
  const extrato = nomeNoExtrato(cfg.marca);

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
        ...(extrato ? { "product_data[statement_descriptor]": extrato } : {}),
        "metadata[plan_id]": plano.id,
      },
      `preco-${chave}`,
    );
    if (typeof preco.id !== "string") throw new ErroDaStripe("recusada", "a Stripe criou o preço sem id");
    return preco.id;
  }

  /**
   * O preço do excedente: o medidor (`EVENTO_DO_EXCEDENTE`, somado por ciclo) e um preço por uso ligado a ele,
   * reencontrados pela chave ou criados agora — ninguém cadastra nada no painel da Stripe.
   */
  async function precoDoExcedente(centavosPorConversa: number): Promise<string> {
    const chave = `${PREFIXO_DO_EXCEDENTE}${centavosPorConversa}`;
    const achados = await chamar("GET", `/prices?active=true&limit=1&lookup_keys[]=${encodeURIComponent(chave)}`);
    const existente = Array.isArray(achados.data) ? (achados.data[0] as { id?: unknown } | undefined) : undefined;
    if (typeof existente?.id === "string") return existente.id;

    const medidores = await chamar("GET", "/billing/meters?status=active&limit=100");
    const lista = (Array.isArray(medidores.data) ? medidores.data : []) as { id?: unknown; event_name?: unknown }[];
    let medidor = lista.find((m) => m.event_name === EVENTO_DO_EXCEDENTE)?.id;
    if (typeof medidor !== "string") {
      const novo = await chamar(
        "POST",
        "/billing/meters",
        {
          display_name: "Conversas além da franquia",
          event_name: EVENTO_DO_EXCEDENTE,
          "default_aggregation[formula]": "sum",
          "customer_mapping[type]": "by_id",
          "customer_mapping[event_payload_key]": "stripe_customer_id",
          "value_settings[event_payload_key]": "value",
        },
        `medidor-${EVENTO_DO_EXCEDENTE}`,
      );
      medidor = novo.id;
      if (typeof medidor !== "string") throw new ErroDaStripe("recusada", "a Stripe criou o medidor sem id");
    }

    const preco = await chamar(
      "POST",
      "/prices",
      {
        currency: "brl",
        unit_amount: centavosPorConversa,
        "recurring[interval]": "month",
        "recurring[usage_type]": "metered",
        "recurring[meter]": medidor,
        lookup_key: chave,
        "product_data[name]": "Conversas além da franquia do plano",
        ...(extrato ? { "product_data[statement_descriptor]": extrato } : {}),
      },
      `preco-${chave}`,
    );
    if (typeof preco.id !== "string") throw new ErroDaStripe("recusada", "a Stripe criou o preço do excedente sem id");
    return preco.id;
  }

  return {
    precoDoPlano,
    precoDoExcedente,

    /**
     * Põe o excedente na assinatura, se ainda não está. Sem cobrança proporcional: o item por uso só cobra o que
     * for informado, e a assinatura existente não paga nada por ganhá-lo.
     */
    async garantirExcedenteNaAssinatura(assinatura: AssinaturaDaStripe, centavosPorConversa: number): Promise<void> {
      if (assinatura.itemDoExcedente) return;
      const preco = await precoDoExcedente(centavosPorConversa);
      await chamar(
        "POST",
        "/subscription_items",
        { subscription: assinatura.id, price: preco, proration_behavior: "none" },
        `excedente-item-${assinatura.id}-${preco}`,
      );
    },

    /** Informa à Stripe `quantidade` conversas a mais no ciclo deste cliente. */
    async informarExcedente(p: { clienteId: string; quantidade: number; chave: string }): Promise<void> {
      await chamar("POST", "/billing/meter_events", {
        event_name: EVENTO_DO_EXCEDENTE,
        "payload[stripe_customer_id]": p.clienteId,
        "payload[value]": p.quantidade,
        identifier: p.chave,
      });
    },

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
