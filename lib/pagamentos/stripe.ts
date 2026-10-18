/**
 * Pix pela Stripe — a cobrança que nasce DENTRO da conversa, no valor que a negociação liberou.
 *
 * Escrito contra a API pública da Stripe (`payment_intents`, `webhook_endpoints`) com `fetch` puro: o
 * produto não carrega SDK de provedor de pagamento (o Asaas, ao lado, é igual). **Não foi exercitado
 * contra conta real**: as bordas de rede são injetáveis e os testes cobrem o contrato assumido aqui. O
 * desvio de formato que aparecer vira erro com a resposta da Stripe — e quem chama cai no link de
 * pagamento de sempre, nunca em silêncio.
 *
 * ─── Cobrança em dobro ───────────────────────────────────────────────────────────────
 * O envio é "pelo menos uma vez": o turno pode rodar de novo. A cobrança nasce com `Idempotency-Key`
 * determinística (conversa + valor + janela de tempo), então a repetição devolve a MESMA cobrança.
 *
 * ─── O que a pessoa precisa informar ─────────────────────────────────────────────────
 * Nada. O Pix da Stripe não pede CPF nem e-mail de quem paga: o código "copia e cola" é pago no app do
 * banco. É a razão de ele existir aqui ao lado do checkout, que pede cadastro.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export interface CredencialStripe {
  /** Chave secreta ou restrita (`sk_…` / `rk_…`). */
  chave: string;
  /**
   * A conta conectada (`acct_…`) em nome de quem a chamada é feita — Stripe Connect. Com ela, a `chave` é a
   * da INSTALAÇÃO e vai o cabeçalho `Stripe-Account`: a cobrança nasce na conta da empresa (dinheiro no banco
   * dela, reembolso e contestação no saldo dela). Sem ela, a chave é a da própria empresa, colada na tela.
   */
  conta?: string | null;
  /**
   * Taxa da plataforma por cobrança, em centavos — só com `conta`. A Stripe a desconta na própria cobrança e
   * credita na conta da instalação (`application_fee_amount`).
   */
  taxaCentavos?: number;
}

/**
 * A taxa da plataforma que vai numa cobrança, ou `null` quando não vai: sem conta conectada, sem taxa, ou
 * cobrança pequena demais para ela (a Stripe exige taxa positiva e MENOR que o valor cobrado — mandar uma
 * taxa igual ou maior faria a Stripe recusar a cobrança inteira, e a pessoa ficaria sem como pagar).
 */
export function taxaDaPlataforma(cred: CredencialStripe, valorCentavos: number): number | null {
  const taxa = cred.conta ? Math.round(cred.taxaCentavos ?? 0) : 0;
  return taxa > 0 && taxa < valorCentavos ? taxa : null;
}

export interface PedidoDePix {
  valorCentavos: number;
  descricao: string;
  /** Determinística — é o que impede a cobrança em dobro. */
  referencia: string;
  /** Vai e volta no aviso de pagamento: é assim que o aviso sabe de quem é o dinheiro. */
  metadados: Record<string, string>;
  /** Validade do código, em segundos. */
  expiraEmSegundos: number;
}

export interface PixCriado {
  id: string;
  copiaECola: string;
  /** Imagem do QR hospedada pela Stripe; `null` se não vier. */
  qrPng: string | null;
  /** Instante (ISO) em que o código deixa de valer; `null` se não vier. */
  expiraEm: string | null;
}

export interface PedidoDeLink {
  valorCentavos: number;
  /** ISO-4217 (`EUR`, `USD`). */
  moeda: string;
  descricao: string;
  /** Determinística — a repetição do envio devolve o MESMO link. */
  referencia: string;
  metadados: Record<string, string>;
  /** O que a pessoa lê na página da Stripe depois de pagar. */
  mensagemDepoisDePagar: string;
}

export interface LinkCriado {
  id: string;
  url: string;
}

export interface PedidoDeBoleto {
  valorCentavos: number;
  descricao: string;
  /** Determinística — a repetição do envio devolve o MESMO boleto. */
  referencia: string;
  metadados: Record<string, string>;
  /** O banco exige quem paga: nome, CPF, e-mail e endereço. */
  pagador: { nome: string; cpf: string; email: string; endereco: { cep: string; logradouro: string; cidade: string; uf: string } };
  venceEmDias: number;
}

export interface BoletoCriado {
  id: string;
  /** A página do boleto, com o código de barras. */
  url: string;
  /** A linha digitável; `null` se não vier. */
  linhaDigitavel: string | null;
}

export class ErroDaStripe extends Error {
  constructor(
    readonly codigo: "chave_invalida" | "pix_indisponivel" | "recusada" | "indisponivel",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDaStripe";
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const BASE = "https://api.stripe.com/v1";
const TEMPO_LIMITE_MS = 12_000;

/** Corpo `application/x-www-form-urlencoded` com as chaves aninhadas no formato da Stripe (`a[b][c]`). */
export function corpoDaStripe(campos: Record<string, string | number | boolean>): string {
  return Object.entries(campos)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}

/** Regra pura: o e-mail de um PaymentIntent com `latest_charge` expandido. */
export function emailDoPagamento(pi: Record<string, unknown>): string | null {
  const cobranca = (pi.latest_charge ?? null) as { billing_details?: { email?: unknown }; receipt_email?: unknown } | null;
  const candidatos = [cobranca?.billing_details?.email, cobranca?.receipt_email, pi.receipt_email];
  for (const c of candidatos) {
    if (typeof c === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim())) return c.trim().toLowerCase();
  }
  return null;
}

export type ChamadaDaStripe = (
  metodo: "GET" | "POST" | "DELETE",
  caminho: string,
  campos?: Record<string, string | number | boolean>,
  idempotencia?: string,
) => Promise<Record<string, unknown>>;

/**
 * A chamada crua à API da Stripe, com o mesmo tratamento de erro do cliente abaixo. Exposta para quem
 * precisa de outra parte da API (a assinatura dos planos, em `lib/planos/stripe-dos-planos.ts`).
 */
export function criarChamadaDaStripe(cred: CredencialStripe, opts: { fetch?: Fetch } = {}): ChamadaDaStripe {
  const buscar: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));

  return async function chamar(metodo, caminho, campos, idempotencia) {
    let resposta: Response;
    try {
      resposta = await buscar(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${cred.chave}`,
          ...(cred.conta ? { "Stripe-Account": cred.conta } : {}),
          ...(campos ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          ...(idempotencia ? { "Idempotency-Key": idempotencia } : {}),
        },
        ...(campos ? { body: corpoDaStripe(campos) } : {}),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (e) {
      throw new ErroDaStripe("indisponivel", `a Stripe não respondeu: ${e instanceof Error ? e.message : String(e)}`);
    }
    const json = (await resposta.json().catch(() => null)) as Record<string, unknown> | null;
    if (resposta.ok && json) return json;
    const erro = (json?.error ?? {}) as { message?: string; code?: string; type?: string };
    const texto = (erro.message ?? `HTTP ${resposta.status}`).slice(0, 300);
    if (resposta.status === 401 || resposta.status === 403) throw new ErroDaStripe("chave_invalida", texto);
    // A conta sem o Pix ativado responde 400 dizendo que o método de pagamento não está disponível.
    if (/pix/i.test(texto) && /invalid|activated|not\s+(enabled|available|supported|active)/i.test(texto)) {
      throw new ErroDaStripe("pix_indisponivel", texto);
    }
    if (resposta.status >= 500 || resposta.status === 429) throw new ErroDaStripe("indisponivel", texto);
    throw new ErroDaStripe("recusada", texto);
  };
}

export function criarClienteStripe(cred: CredencialStripe, opts: { fetch?: Fetch } = {}) {
  const chamar = criarChamadaDaStripe(cred, opts);

  return {
    /** A chave vale? E de que conta é. Usado ao conectar pela tela. */
    async lerConta(): Promise<{ id: string; pixAtivo: boolean; nome: string | null }> {
      const conta = await chamar("GET", "/account");
      const capacidades = (conta.capabilities ?? {}) as Record<string, string>;
      const perfil = (conta.business_profile ?? {}) as { name?: string | null };
      return { id: String(conta.id ?? ""), pixAtivo: capacidades.pix_payments === "active", nome: perfil.name ?? null };
    },

    /** Cria (ou reencontra, pela referência) a cobrança por Pix e devolve o "copia e cola". */
    async criarPix(pedido: PedidoDePix): Promise<PixCriado> {
      const campos: Record<string, string | number | boolean> = {
        amount: pedido.valorCentavos,
        currency: "brl",
        "payment_method_types[0]": "pix",
        "payment_method_data[type]": "pix",
        "payment_method_options[pix][expires_after_seconds]": pedido.expiraEmSegundos,
        confirm: true,
        description: pedido.descricao.slice(0, 200),
      };
      const taxaDoPix = taxaDaPlataforma(cred, pedido.valorCentavos);
      if (taxaDoPix !== null) campos.application_fee_amount = taxaDoPix;
      for (const [k, v] of Object.entries(pedido.metadados)) campos[`metadata[${k}]`] = v.slice(0, 480);
      const pi = await chamar("POST", "/payment_intents", campos, pedido.referencia);
      const qr = ((pi.next_action ?? {}) as { pix_display_qr_code?: { data?: string; image_url_png?: string; expires_at?: number } })
        .pix_display_qr_code;
      if (!qr?.data) throw new ErroDaStripe("recusada", "a Stripe criou a cobrança sem o código do Pix");
      return {
        id: String(pi.id ?? ""),
        copiaECola: qr.data,
        qrPng: qr.image_url_png ?? null,
        expiraEm: typeof qr.expires_at === "number" ? new Date(qr.expires_at * 1000).toISOString() : null,
      };
    },

    /** Emite (ou reencontra, pela referência) um boleto e devolve a página dele e a linha digitável. */
    async criarBoleto(pedido: PedidoDeBoleto): Promise<BoletoCriado> {
      const p = pedido.pagador;
      const campos: Record<string, string | number | boolean> = {
        amount: pedido.valorCentavos,
        currency: "brl",
        "payment_method_types[0]": "boleto",
        "payment_method_data[type]": "boleto",
        "payment_method_data[boleto][tax_id]": p.cpf,
        "payment_method_data[billing_details][name]": p.nome.slice(0, 100),
        "payment_method_data[billing_details][email]": p.email,
        "payment_method_data[billing_details][address][line1]": p.endereco.logradouro.slice(0, 100),
        "payment_method_data[billing_details][address][city]": p.endereco.cidade.slice(0, 60),
        "payment_method_data[billing_details][address][state]": p.endereco.uf,
        "payment_method_data[billing_details][address][postal_code]": p.endereco.cep,
        "payment_method_data[billing_details][address][country]": "BR",
        "payment_method_options[boleto][expires_after_days]": pedido.venceEmDias,
        confirm: true,
        description: pedido.descricao.slice(0, 200),
      };
      const taxaDoBoleto = taxaDaPlataforma(cred, pedido.valorCentavos);
      if (taxaDoBoleto !== null) campos.application_fee_amount = taxaDoBoleto;
      for (const [k, v] of Object.entries(pedido.metadados)) campos[`metadata[${k}]`] = v.slice(0, 480);
      const pi = await chamar("POST", "/payment_intents", campos, pedido.referencia);
      const detalhes = ((pi.next_action ?? {}) as { boleto_display_details?: { number?: string; hosted_voucher_url?: string } }).boleto_display_details;
      if (!detalhes?.hosted_voucher_url) throw new ErroDaStripe("recusada", "a Stripe criou a cobrança sem o boleto");
      return { id: String(pi.id ?? ""), url: detalhes.hosted_voucher_url, linhaDigitavel: detalhes.number ?? null };
    },

    /**
     * Cria (ou reencontra, pela referência) um link de pagamento em moeda estrangeira, no cartão. É o que
     * substitui o link em reais para quem escreve de fora do país. O link vale para UM pagamento: depois de
     * pago ele se fecha, e os metadados seguem para a cobrança — é por eles que o aviso acha a pessoa.
     */
    async criarLinkDePagamento(pedido: PedidoDeLink): Promise<LinkCriado> {
      const campos: Record<string, string | number | boolean> = {
        "line_items[0][price_data][currency]": pedido.moeda.toLowerCase(),
        "line_items[0][price_data][unit_amount]": pedido.valorCentavos,
        "line_items[0][price_data][product_data][name]": pedido.descricao.slice(0, 200),
        "line_items[0][quantity]": 1,
        "restrictions[completed_sessions][limit]": 1,
        "after_completion[type]": "hosted_confirmation",
        "after_completion[hosted_confirmation][custom_message]": pedido.mensagemDepoisDePagar.slice(0, 500),
        "payment_intent_data[description]": pedido.descricao.slice(0, 200),
      };
      // A taxa configurada é em reais. Nunca reinterpretar 99 centavos como US$ 0,99 ou € 0,99.
      // Até existir regra explícita de conversão, links em outras moedas não levam taxa da plataforma.
      const taxaDoLink = pedido.moeda.toUpperCase() === "BRL" ? taxaDaPlataforma(cred, pedido.valorCentavos) : null;
      if (taxaDoLink !== null) campos.application_fee_amount = taxaDoLink;
      for (const [k, v] of Object.entries(pedido.metadados)) {
        campos[`metadata[${k}]`] = v.slice(0, 480);
        campos[`payment_intent_data[metadata][${k}]`] = v.slice(0, 480);
      }
      const link = await chamar("POST", "/payment_links", campos, pedido.referencia);
      if (typeof link.url !== "string" || !link.url.startsWith("https://")) {
        throw new ErroDaStripe("recusada", "a Stripe criou o link sem endereço");
      }
      return { id: String(link.id ?? ""), url: link.url };
    },

    /**
     * Quanto uma cobrança em moeda estrangeira virou na moeda da conta (o que a Stripe credita, antes da
     * tarifa). `null` quando a Stripe ainda não tem o lançamento ou a chave não pode lê-lo — quem chama
     * registra o valor na moeda original em vez de inventar um câmbio.
     */
    async lerValorConvertido(cobrancaId: string): Promise<{ valorCentavos: number; moeda: string } | null> {
      const pi = await chamar("GET", `/payment_intents/${encodeURIComponent(cobrancaId)}?expand[]=latest_charge.balance_transaction`);
      const lancamento = ((pi.latest_charge ?? {}) as { balance_transaction?: unknown }).balance_transaction;
      if (lancamento === null || typeof lancamento !== "object") return null;
      const { amount, currency } = lancamento as { amount?: unknown; currency?: unknown };
      if (typeof amount !== "number" || amount <= 0 || typeof currency !== "string") return null;
      return { valorCentavos: amount, moeda: currency.toUpperCase() };
    },

    /**
     * O e-mail de quem pagou, se a Stripe tiver um: o do cartão ou do boleto (`billing_details`) ou o do
     * recibo. O Pix criado na conversa não pede e-mail, e aí volta `null`.
     */
    async lerEmailDoPagador(cobrancaId: string): Promise<string | null> {
      const pi = await chamar("GET", `/payment_intents/${encodeURIComponent(cobrancaId)}?expand[]=latest_charge`);
      return emailDoPagamento(pi);
    },

    /** Registra na Stripe o endereço que recebe o aviso de pagamento. Devolve o segredo da assinatura (vem uma vez só). */
    async criarAvisoDePagamento(url: string): Promise<{ id: string; segredo: string }> {
      const r = await chamar("POST", "/webhook_endpoints", {
        url,
        "enabled_events[0]": "payment_intent.succeeded",
        description: "Confirmação de Pix recebido na conversa",
      });
      if (typeof r.secret !== "string" || r.secret === "") throw new ErroDaStripe("recusada", "a Stripe não devolveu o segredo do aviso");
      return { id: String(r.id ?? ""), segredo: r.secret };
    },
  };
}

/**
 * O aviso de pagamento DA PLATAFORMA para as contas conectadas (`connect=true`): um endereço só recebe os
 * pagamentos de todas as empresas conectadas, e o evento traz `account` — é por ela que se acha a empresa.
 * Criado com a chave da instalação (sem `conta`). Devolve o segredo da assinatura (vem uma vez só).
 */
export async function criarAvisoDaPlataforma(
  cred: CredencialStripe,
  url: string,
  opts: { fetch?: Fetch } = {},
): Promise<{ id: string; segredo: string }> {
  const r = await criarChamadaDaStripe({ chave: cred.chave }, opts)("POST", "/webhook_endpoints", {
    url,
    connect: true,
    "enabled_events[0]": "payment_intent.succeeded",
    "enabled_events[1]": "account.updated",
    description: "Pagamentos e cadastro das contas conectadas",
  }, `aviso-connect-${createHash("sha256").update(url).digest("hex")}`);
  if (typeof r.secret !== "string" || r.secret === "") throw new ErroDaStripe("recusada", "a Stripe não devolveu o segredo do aviso");
  return { id: String(r.id ?? ""), segredo: r.secret };
}

/** Tolerância do carimbo de tempo do aviso — a mesma que a biblioteca oficial usa. */
export const TOLERANCIA_DO_AVISO_S = 300;

/**
 * Confere a assinatura do aviso (`Stripe-Signature: t=…,v1=…`): HMAC-SHA256 de `t.corpo` com o segredo do
 * endereço, comparado em tempo constante, e o carimbo dentro da tolerância (contra repetição).
 */
export function assinaturaDaStripeConfere(corpoCru: string, cabecalho: string | null, segredo: string, agora: Date): boolean {
  if (!cabecalho || !segredo) return false;
  const partes = cabecalho.split(",").map((p) => p.trim().split("="));
  const t = partes.find(([k]) => k === "t")?.[1];
  const assinaturas = partes.filter(([k]) => k === "v1").map(([, v]) => v ?? "");
  if (!t || !/^\d+$/.test(t) || assinaturas.length === 0) return false;
  if (Math.abs(Math.floor(agora.getTime() / 1000) - Number(t)) > TOLERANCIA_DO_AVISO_S) return false;
  const esperado = Buffer.from(createHmac("sha256", segredo).update(`${t}.${corpoCru}`, "utf8").digest("hex"), "utf8");
  return assinaturas.some((a) => {
    const recebido = Buffer.from(a, "utf8");
    return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
  });
}
