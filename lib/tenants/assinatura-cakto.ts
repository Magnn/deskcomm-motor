/**
 * A ASSINATURA COBRADA PELA CAKTO — o aviso dela, traduzido para "libera" ou "suspende".
 *
 * A regra de quem é criado, reativado e suspenso mora em `assinatura.ts` e não sabe
 * de plataforma nenhuma. Este módulo é só a tradução: lê o aviso do jeito que a Cakto
 * manda (docs.cakto.com.br/conceitos/webhooks), confere que veio dela, confere que é
 * do PRODUTO da assinatura e diz o que fazer. Sem I/O — puro e testável.
 *
 * ─── Quem é a empresa ───────────────────────────────────────────────────────────────
 * A chave é o E-MAIL do comprador. É o único dado que aparece igual em TODOS os avisos
 * (compra, renovação, atraso, cancelamento, reembolso): o `data.id` é do pedido e muda
 * a cada cobrança, e o bloco `subscription` só vem em parte deles. Um e-mail, uma empresa.
 *
 * ─── Por que o produto é OBRIGATÓRIO ────────────────────────────────────────────────
 * A conta da Cakto do dono da instalação costuma vender outras coisas. Sem a lista, a
 * compra de qualquer produto criaria uma empresa aqui — e o reembolso de qualquer
 * produto suspenderia um cliente em dia.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { segredoDaCaktoConfere } from "@/lib/webhooks/cakto";

export type DecisaoDaAssinatura = "ativar" | "suspender" | "ignorar";

/** Pagou, renovou, voltou a pagar: a empresa existe e está liberada. */
const EVENTOS_QUE_ATIVAM = [
  "purchase_approved",
  "subscription_renewed",
  "subscription_resumed",
  "subscription_late_recovered",
] as const;

/**
 * Deixou de pagar: a empresa é suspensa, com o motivo que o dono da instalação lê
 * no painel. `subscription_renewal_refused` NÃO está aqui de propósito: é uma
 * tentativa recusada, e a Cakto tenta de novo — suspender ali derrubaria os fluxos
 * de um cliente por um cartão que passa na tentativa seguinte. O atraso de verdade
 * chega como `subscription_late`, e volta sozinho com `subscription_late_recovered`.
 */
const EVENTOS_QUE_SUSPENDEM: Record<string, string> = {
  subscription_canceled: "Assinatura cancelada na Cakto.",
  subscription_late: "Assinatura em atraso na Cakto.",
  subscription_paused: "Assinatura pausada na Cakto.",
  refund: "Pagamento da assinatura reembolsado na Cakto.",
  chargeback: "Pagamento da assinatura contestado (chargeback) na Cakto.",
};

export function decisaoDoEvento(evento: string): DecisaoDaAssinatura {
  if ((EVENTOS_QUE_ATIVAM as readonly string[]).includes(evento)) return "ativar";
  if (Object.hasOwn(EVENTOS_QUE_SUSPENDEM, evento)) return "suspender";
  return "ignorar";
}

export function motivoDaSuspensao(evento: string): string | undefined {
  return Object.hasOwn(EVENTOS_QUE_SUSPENDEM, evento) ? EVENTOS_QUE_SUSPENDEM[evento] : undefined;
}

export interface AvisoDeAssinatura {
  evento: string;
  /** `data.id` — o pedido. Só para o log: a empresa é achada pelo e-mail. */
  pedidoId: string | null;
  produto: { id: string | null; shortId: string | null; nome: string | null };
  ofertaId: string | null;
  cliente: { nome: string | null; email: string };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function eventoDoAviso(payload: unknown): string | null {
  return isRecord(payload) ? texto(payload.event) : null;
}

/** `null` quando falta o que identifica o cliente — sem e-mail não há empresa a achar. */
export function lerAvisoDeAssinatura(payload: unknown): AvisoDeAssinatura | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const evento = texto(payload.event);
  if (evento === null) return null;
  const d = payload.data;
  const cliente = isRecord(d.customer) ? d.customer : {};
  const email = texto(cliente.email)?.toLowerCase() ?? null;
  if (email === null) return null;
  const produto = isRecord(d.product) ? d.product : {};
  const oferta = isRecord(d.offer) ? d.offer : {};
  return {
    evento,
    pedidoId: texto(d.id),
    produto: { id: texto(produto.id), shortId: texto(produto.short_id), nome: texto(produto.name) },
    ofertaId: texto(oferta.id),
    cliente: { nome: texto(cliente.name), email },
  };
}

export interface ProdutoDaAssinatura {
  /** Código em minúsculas — é assim que casa com o aviso. */
  codigo: string;
  /** Como o dono escreveu — o link do checkout diferencia maiúsculas. */
  codigoOriginal: string;
  /** O plano que esta oferta vende (`código=plano`). `null` = assinatura sem plano. */
  plano: string | null;
}

/**
 * A lista do `.env`: códigos separados por vírgula, sem diferença de caixa. Cada
 * item pode dizer qual PLANO a oferta vende — `código=plano` (ex.:
 * `a8BcHrY=start,b9CdIsZ=pro`). Sem `=plano`, a oferta é a assinatura antiga:
 * pagar cria/libera a empresa, deixar de pagar a suspende.
 */
export function produtosDaAssinatura(lista: string): ProdutoDaAssinatura[] {
  const produtos: ProdutoDaAssinatura[] = [];
  for (const item of lista.split(",")) {
    const [codigo = "", plano = ""] = item.split("=").map((p) => p.trim());
    if (codigo === "") continue;
    produtos.push({ codigo: codigo.toLowerCase(), codigoOriginal: codigo, plano: plano === "" ? null : plano.toLowerCase() });
  }
  return produtos;
}

/**
 * A oferta do aviso, entre as da assinatura — ou `null` quando o aviso é de outro
 * produto. Cada código da lista pode ser o id do produto, o código curto dele ou o
 * código da OFERTA — o que aparece no link do checkout (`pay.cakto.com.br/<código>`),
 * que é o que o dono tem à mão. O código da OFERTA é conferido primeiro: é ele que
 * distingue dois planos do mesmo produto.
 */
export function produtoDoAviso(aviso: AvisoDeAssinatura, produtos: readonly ProdutoDaAssinatura[]): ProdutoDaAssinatura | null {
  for (const codigo of [aviso.ofertaId, aviso.produto.shortId, aviso.produto.id]) {
    if (codigo === null) continue;
    const achado = produtos.find((p) => p.codigo === codigo.toLowerCase());
    if (achado) return achado;
  }
  return null;
}

/** O link do checkout de um plano, para a tela de planos. `null` = plano sem oferta declarada. */
export function linkDoCheckoutDoPlano(produtos: readonly ProdutoDaAssinatura[], planoId: string): string | null {
  const oferta = produtos.find((p) => p.plano === planoId);
  return oferta ? `https://pay.cakto.com.br/${encodeURIComponent(oferta.codigoOriginal)}` : null;
}

const TOLERANCIA_DO_CARIMBO_S = 5 * 60;

/**
 * O aviso veio da Cakto?
 *
 * Ela prova a origem de dois jeitos. Com o cabeçalho `X-Cakto-Signature`
 * (`v1=<hmac-sha256>` de `{timestamp}.{corpo cru}`, chave = o segredo do webhook), que
 * é o que vale quando ele vem: cobre o corpo inteiro e o carimbo de hora barra a
 * repetição de um aviso antigo. Sem cabeçalho, sobra o `secret` devolvido dentro do
 * corpo. Cabeçalho presente e errado é recusa — nunca cai para o segredo do corpo.
 */
export function avisoVeioDaCakto(p: {
  corpoCru: string;
  payload: unknown;
  assinatura: string | null;
  carimbo: string | null;
  segredo: string;
  agoraMs: number;
}): boolean {
  if (p.segredo === "") return false;
  const assinatura = p.assinatura?.trim() ?? "";
  if (assinatura === "") return segredoDaCaktoConfere(p.payload, p.segredo);

  const carimbo = p.carimbo?.trim() ?? "";
  if (!/^\d{1,12}$/.test(carimbo)) return false;
  if (Math.abs(p.agoraMs / 1000 - Number(carimbo)) > TOLERANCIA_DO_CARIMBO_S) return false;

  const esperado = `v1=${createHmac("sha256", p.segredo).update(`${carimbo}.${p.corpoCru}`).digest("hex")}`;
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
