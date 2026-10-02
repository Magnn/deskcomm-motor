/**
 * Cobrança pelo Asaas (PIX). O transporte do nó "Cobrança" do fluxo.
 *
 * Escrito contra a API v3 pública do Asaas (clientes, cobranças, QR do PIX). **Não foi exercitado contra a
 * conta real de ninguém** — as bordas de rede são injetáveis e os testes cobrem o contrato que aqui se assume.
 * O primeiro uso deve ser em SANDBOX (a tela de conexão tem o ambiente), e o desvio de formato que aparecer
 * vira erro visível com a resposta do Asaas, não cobrança silenciosa.
 *
 * ─── Por que o reuso por `externalReference` é o centro deste arquivo ───────
 *
 * O envio de um passo do fluxo é "intenção exatamente uma vez, entrega pelo menos uma vez": o job pode
 * rodar de novo depois de um crash, e cobrar duas vezes a mesma pessoa é o pior erro possível aqui. Então a
 * cobrança nasce com `externalReference` determinístico (inscrição + caixa) e, ANTES de criar, pergunta ao
 * Asaas se ela já existe. O mesmo vale para o cliente (chave: o contato).
 */
export type AmbienteAsaas = "production" | "sandbox";

export interface CredencialAsaas {
  apiKey: string;
  ambiente: AmbienteAsaas;
}

export interface PedidoDeCobranca {
  /** Determinístico por passo do fluxo — é o que impede a cobrança em dobro. */
  referencia: string;
  cliente: { referencia: string; nome: string; telefone: string | null; email: string | null };
  valorCentavos: number;
  descricao: string;
}

export interface CobrancaCriada {
  id: string;
  /** Página de pagamento do Asaas (PIX, cartão, boleto conforme a conta). */
  link: string;
  /** "PIX copia e cola"; `null` se o Asaas ainda não gerou o QR. */
  pixCopiaECola: string | null;
  reaproveitada: boolean;
}

/** Recusa que repetir não conserta (chave inválida, conta sem permissão, dado que o Asaas rejeita). */
export class ErroDeCobranca extends Error {
  constructor(
    readonly codigo: "chave_invalida" | "recusada",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeCobranca";
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const BASE: Record<AmbienteAsaas, string> = {
  production: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
};

const TEMPO_LIMITE_MS = 15_000;

/** Celular BR sem o 55 e só dígitos, como o Asaas espera; o que não cabe no formato fica de fora. */
export function celularParaAsaas(telefone: string | null): string | undefined {
  const d = (telefone ?? "").replace(/\D/g, "");
  const nacional = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  return nacional.length === 10 || nacional.length === 11 ? nacional : undefined;
}

/** `yyyy-mm-dd` do dia seguinte, no fuso de Brasília — a cobrança vence amanhã, nunca "hoje às 00:00". */
export function vencimentoDeAmanha(agora: Date): string {
  const brasilia = new Date(agora.getTime() - 3 * 3_600_000);
  brasilia.setUTCDate(brasilia.getUTCDate() + 1);
  return brasilia.toISOString().slice(0, 10);
}

export function criarClienteAsaas(cred: CredencialAsaas, opts: { fetch?: Fetch; agora?: () => Date } = {}) {
  const http: Fetch = opts.fetch ?? ((url, init) => fetch(url, init));
  const agora = opts.agora ?? (() => new Date());

  async function chamar<T>(metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
    let resposta: Response;
    try {
      resposta = await http(`${BASE[cred.ambiente]}${caminho}`, {
        method: metodo,
        headers: {
          "content-type": "application/json",
          // No header, nunca na query: chave em URL vaza para log de proxy.
          access_token: cred.apiKey,
          // A Asaas exige o cabeçalho; o valor é livre — sem nome de marca (régua de branding).
          "user-agent": "crm-fluxo-de-atendimento",
        },
        ...(corpo !== undefined ? { body: JSON.stringify(corpo) } : {}),
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (e) {
      // Rede e timeout: transitório. Erro comum para o job tentar de novo (a referência impede a cobrança dupla).
      throw new Error(`asaas_indisponivel: ${e instanceof Error ? e.message : "falha de rede"}`);
    }
    const texto = await resposta.text().catch(() => "");
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      // corpo não-JSON (gateway/WAF): segue com o texto cru na mensagem
    }
    if (resposta.ok) return json as T;

    const detalhe =
      (json as { errors?: Array<{ description?: string }> } | null)?.errors
        ?.map((x) => x.description)
        .filter(Boolean)
        .join("; ") || texto.slice(0, 300);
    if (resposta.status === 401 || resposta.status === 403) {
      throw new ErroDeCobranca("chave_invalida", `O Asaas recusou a chave de API (${resposta.status}). Reconecte em Configurações › Pagamentos.`);
    }
    if (resposta.status >= 500 || resposta.status === 429) {
      throw new Error(`asaas_indisponivel: ${resposta.status} ${detalhe}`);
    }
    throw new ErroDeCobranca("recusada", `O Asaas recusou a cobrança: ${detalhe || resposta.status}`);
  }

  async function clienteDe(c: PedidoDeCobranca["cliente"]): Promise<string> {
    const achados = await chamar<{ data?: Array<{ id: string }> }>(
      "GET",
      `/customers?externalReference=${encodeURIComponent(c.referencia)}&limit=1`,
    );
    const existente = achados.data?.[0]?.id;
    if (existente) return existente;
    const criado = await chamar<{ id: string }>("POST", "/customers", {
      name: c.nome.trim() || "Cliente",
      externalReference: c.referencia,
      ...(c.email ? { email: c.email } : {}),
      ...(celularParaAsaas(c.telefone) ? { mobilePhone: celularParaAsaas(c.telefone) } : {}),
    });
    return criado.id;
  }

  async function pixDe(id: string): Promise<string | null> {
    try {
      const r = await chamar<{ payload?: string }>("GET", `/payments/${encodeURIComponent(id)}/pixQrCode`);
      return r.payload?.trim() || null;
    } catch (e) {
      // O link da cobrança basta para pagar; o copia-e-cola é um extra, e a falta dele não cancela o envio.
      if (e instanceof ErroDeCobranca) return null;
      throw e;
    }
  }

  return {
    /** A chave funciona? Consulta leve e sem efeito; `chave_invalida` é o único desfecho que a tela trata como recusa. */
    async validarChave(): Promise<void> {
      await chamar("GET", "/customers?limit=1");
    },
    async cobrar(pedido: PedidoDeCobranca): Promise<CobrancaCriada> {
      if (!Number.isInteger(pedido.valorCentavos) || pedido.valorCentavos <= 0) {
        throw new ErroDeCobranca("recusada", "O valor da cobrança precisa ser maior que zero.");
      }
      const existentes = await chamar<{ data?: Array<{ id: string; invoiceUrl?: string }> }>(
        "GET",
        `/payments?externalReference=${encodeURIComponent(pedido.referencia)}&limit=1`,
      );
      const ja = existentes.data?.[0];
      if (ja?.id && ja.invoiceUrl) {
        return { id: ja.id, link: ja.invoiceUrl, pixCopiaECola: await pixDe(ja.id), reaproveitada: true };
      }

      const cliente = await clienteDe(pedido.cliente);
      const criada = await chamar<{ id: string; invoiceUrl?: string }>("POST", "/payments", {
        customer: cliente,
        billingType: "PIX",
        value: pedido.valorCentavos / 100,
        dueDate: vencimentoDeAmanha(agora()),
        description: pedido.descricao.slice(0, 500),
        externalReference: pedido.referencia,
      });
      if (!criada.id || !criada.invoiceUrl) {
        throw new ErroDeCobranca("recusada", "O Asaas criou a cobrança sem devolver o link de pagamento.");
      }
      return { id: criada.id, link: criada.invoiceUrl, pixCopiaECola: await pixDe(criada.id), reaproveitada: false };
    },
  };
}
