/**
 * A VENDA DE UMA CONVERSA DE ANÚNCIO NUM NÚMERO DO INTERMEDIÁRIO, CONTADA NA META.
 *
 * Medido em 21/11/2026: as campanhas de clique-para-WhatsApp dos números conectados pelo intermediário
 * otimizavam "compra por mensagem", e nenhuma compra chegava ao conjunto de dados da conta do WhatsApp
 * deles. O caminho oficial (`lib/conversoes/destino-de-mensageria.ts`) exige o token da Meta da conta, que
 * neste canal mora no intermediário, não aqui; sem ele a venda caía no pixel do site como `chat`, sem o
 * clique. A Meta não ligava a compra ao anúncio e a campanha otimizava às cegas.
 *
 * O intermediário tem a rota pronta (docs.zernio.com/whatsapp/send-whatsapp-conversion):
 *   - `POST /v1/whatsapp/dataset` cria ou devolve o conjunto de dados da conta (idempotente: uma conta do
 *     WhatsApp só tem um) e o guarda nela. Sem isso, a conversão volta 422.
 *   - `POST /v1/whatsapp/conversions` manda o evento com `action_source = business_messaging`, e repõe
 *     sozinho o `ctwa_clid` que ele capturou na primeira mensagem da conversa.
 *
 * Um 200 só diz que o pedido chegou à Meta: a recusa vem em `eventsFailed`/`failures[]`, e é lida.
 */
import { logger } from "@/lib/logger";

import type { ZernioCredentials } from "./credentials";

type Chave = Pick<ZernioCredentials, "accountId" | "apiKey" | "baseUrl">;

const TEMPO_LIMITE_MS = 10_000;

/** Os eventos que a Meta aceita em mensageria; outro nome volta recusado (2804066). */
const EVENTOS_ACEITOS = new Set(["Purchase", "InitiateCheckout", "LeadSubmitted", "QualifiedLead", "AddToCart", "ViewContent"]);

export interface ConversaoPelaZernio {
  evento: string;
  eventoId: string;
  ocorridoEm: Date;
  /** E.164 sem `+`: o intermediário acha por ele a conversa mais recente que veio de anúncio. */
  telefone: string;
  valorCentavos: number | null;
  moeda: string;
  idExterno?: string | null;
  email?: string | null;
  testEventCode?: string | null;
}

export type ResultadoPelaZernio =
  | { tipo: "ok"; detalhe?: string }
  | { tipo: "transitorio"; detalhe: string; tentarEmMs?: number }
  | { tipo: "permanente"; detalhe: string };

/** Conta com o conjunto de dados já garantido neste processo: a criação é idempotente, mas custa uma chamada. */
const comConjunto = new Set<string>();

/** Só para os testes. */
export function esquecerConjuntosGarantidos(): void {
  comConjunto.clear();
}

async function chamar(creds: Chave, caminho: string, corpo: unknown, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(`${creds.baseUrl}${caminho}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
}

function mensagemDoErro(texto: string): string {
  try {
    const json = JSON.parse(texto) as { error?: string; code?: string; message?: string };
    return [json.code, json.error ?? json.message].filter(Boolean).join(": ").slice(0, 400) || texto.slice(0, 400);
  } catch {
    return texto.slice(0, 400);
  }
}

function classificaFalhaHttp(status: number, texto: string): ResultadoPelaZernio {
  const detalhe = `${status}: ${mensagemDoErro(texto)}`;
  if (status === 429 || status >= 500) return { tipo: "transitorio", detalhe };
  return { tipo: "permanente", detalhe };
}

async function garantirConjunto(creds: Chave, fetchImpl: typeof fetch): Promise<ResultadoPelaZernio> {
  if (comConjunto.has(creds.accountId)) return { tipo: "ok" };
  let resposta: Response;
  try {
    resposta = await chamar(creds, "/v1/whatsapp/dataset", { accountId: creds.accountId }, fetchImpl);
  } catch (erro) {
    return { tipo: "transitorio", detalhe: erro instanceof Error ? erro.message : "falha de rede" };
  }
  const texto = await resposta.text().catch(() => "");
  if (!resposta.ok) {
    // 422 aqui = o token da conta não tem `whatsapp_business_manage_events`: só reconectar o número resolve.
    return classificaFalhaHttp(resposta.status, texto);
  }
  comConjunto.add(creds.accountId);
  logger.info("[conversoes.zernio] conjunto de dados da conta garantido", { accountId: creds.accountId, criado: texto.includes('"created":true') });
  return { tipo: "ok" };
}

export async function enviarConversaoPelaZernio(
  creds: Chave,
  conversao: ConversaoPelaZernio,
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoPelaZernio> {
  if (!EVENTOS_ACEITOS.has(conversao.evento)) {
    return { tipo: "permanente", detalhe: `evento ${conversao.evento} não é aceito em mensageria` };
  }
  const telefone = conversao.telefone.replace(/\D/g, "");
  if (!telefone) return { tipo: "permanente", detalhe: "contato sem telefone" };

  const conjunto = await garantirConjunto(creds, fetchImpl);
  if (conjunto.tipo !== "ok") return conjunto;

  const corpo: Record<string, unknown> = {
    accountId: creds.accountId,
    eventName: conversao.evento,
    eventId: conversao.eventoId,
    eventTime: Math.floor(conversao.ocorridoEm.getTime() / 1000),
    phoneE164: telefone,
  };
  // Sem valor, sem `value`: zero seria aceito e ensinaria que a venda não vale nada.
  if (conversao.valorCentavos !== null && conversao.valorCentavos > 0) {
    corpo.value = conversao.valorCentavos / 100;
    corpo.currency = conversao.moeda.toUpperCase();
  }
  if (conversao.idExterno) corpo.externalId = conversao.idExterno;
  if (conversao.email) corpo.email = conversao.email;
  if (conversao.testEventCode) corpo.testCode = conversao.testEventCode;

  let resposta: Response;
  try {
    resposta = await chamar(creds, "/v1/whatsapp/conversions", corpo, fetchImpl);
  } catch (erro) {
    return { tipo: "transitorio", detalhe: erro instanceof Error ? erro.message : "falha de rede" };
  }
  const texto = await resposta.text().catch(() => "");
  if (!resposta.ok) {
    if (resposta.status === 422 && /dataset/i.test(texto)) comConjunto.delete(creds.accountId);
    logger.warn("[conversoes.zernio] envio recusado", { status: resposta.status, accountId: creds.accountId });
    return classificaFalhaHttp(resposta.status, texto);
  }

  let json: { eventsReceived?: number; eventsFailed?: number; failures?: Array<{ message?: string }>; traceId?: string } = {};
  try {
    json = JSON.parse(texto);
  } catch {
    return { tipo: "transitorio", detalhe: "resposta sem JSON" };
  }
  if ((json.eventsFailed ?? 0) > 0 || (json.eventsReceived ?? 0) < 1) {
    const motivo = json.failures?.[0]?.message ?? "a Meta não recebeu o evento";
    return { tipo: "permanente", detalhe: `Meta recusou: ${motivo}`.slice(0, 400) };
  }
  return { tipo: "ok", detalhe: json.traceId ? `pela Zernio (trace ${json.traceId})` : "pela Zernio" };
}
