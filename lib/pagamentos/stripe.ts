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
import { createHmac, timingSafeEqual } from "node:crypto";

export interface CredencialStripe {
  /** Chave secreta ou restrita (`sk_…` / `rk_…`). */
  chave: string;
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

export function criarClienteStripe(cred: CredencialStripe, opts: { fetch?: Fetch } = {}) {
  const buscar: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));

  async function chamar(metodo: "GET" | "POST", caminho: string, campos?: Record<string, string | number | boolean>, idempotencia?: string) {
    let resposta: Response;
    try {
      resposta = await buscar(`${BASE}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${cred.chave}`,
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
  }

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
