/**
 * O AVISO DE COMPRA DA CAKTO — o contrato, lido do jeito que a Cakto manda.
 *
 * Forma (docs.cakto.com.br/webhooks): `{ secret, event, data: { id, refId, customer:
 * { name, email, phone, birthDate }, offer: { id, name, price }, product: { id, name },
 * status, amount, paymentMethod, paidAt, … } }`. A Cakto NÃO assina o corpo: ela devolve,
 * dentro dele, o `secret` que o dono digitou ao criar o webhook. Por isso a checagem aqui é
 * "o segredo do corpo é o que a fonte guarda", em tempo constante — não o HMAC em cabeçalho
 * que o resto da captação usa.
 *
 * Detecção ESTRITA (evento conhecido + `data` objeto), pelo mesmo motivo do Respondi: nunca
 * capturar por engano o payload de outra origem. Sem I/O — puro e testável.
 *
 * `birthDate` NÃO é lido: o entregável não precisa dele e ele não é nosso para guardar.
 */
import { createHash, timingSafeEqual } from "node:crypto";

import { normalizePhoneBR } from "./inbound";

import { EVENTOS_DA_CAKTO, type EventoDaCakto } from "@/lib/pagamentos/eventos-da-cakto";

export { EVENTOS_DA_CAKTO };
export type { EventoDaCakto };

export interface CompraDaCakto {
  evento: EventoDaCakto;
  /** `data.id` — a chave de idempotência (a Cakto reenvia o mesmo aviso). */
  pedidoId: string;
  refId: string | null;
  produtoId: string | null;
  produtoNome: string | null;
  ofertaNome: string | null;
  valorCentavos: number | null;
  cupom: string | null;
  metodo: string | null;
  pagoEm: string | null;
  status: string | null;
  cliente: { nome: string | null; email: string | null; telefone: string | null };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function isCaktoPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  const { event, data } = payload;
  return typeof event === "string" && (EVENTOS_DA_CAKTO as readonly string[]).includes(event) && isRecord(data);
}

/** `null` quando não é da Cakto ou falta o que identifica o pedido. */
export function mapCaktoPayload(payload: unknown): CompraDaCakto | null {
  if (!isCaktoPayload(payload)) return null;
  const p = payload as { event: EventoDaCakto; data: Record<string, unknown> };
  const d = p.data;
  const pedidoId = texto(d.id) ?? texto(d.refId);
  if (pedidoId === null) return null;

  const cliente = isRecord(d.customer) ? d.customer : {};
  const produto = isRecord(d.product) ? d.product : {};
  const oferta = isRecord(d.offer) ? d.offer : {};
  const valor = typeof d.amount === "number" && Number.isFinite(d.amount) ? Math.round(d.amount * 100) : null;
  // O cupom pode vir como texto ou como objeto `{ code }`, conforme a versão do aviso.
  const cupomBruto = d.coupon;
  const cupom = isRecord(cupomBruto) ? texto(cupomBruto.code) : texto(cupomBruto);

  return {
    evento: p.event,
    pedidoId,
    refId: texto(d.refId),
    produtoId: texto(produto.id),
    produtoNome: texto(produto.name),
    ofertaNome: texto(oferta.name),
    valorCentavos: valor,
    cupom,
    metodo: texto(d.paymentMethod),
    pagoEm: texto(d.paidAt),
    status: texto(d.status),
    cliente: {
      nome: texto(cliente.name),
      email: texto(cliente.email)?.toLowerCase() ?? null,
      telefone: normalizePhoneBR(cliente.phone),
    },
  };
}

/** O segredo do corpo é o da fonte? Tempo constante; sem segredo dos dois lados = recusa. */
export function segredoDaCaktoConfere(payload: unknown, segredoDaFonte: string | null): boolean {
  if (segredoDaFonte === null || segredoDaFonte === "" || !isRecord(payload)) return false;
  const recebido = payload.secret;
  if (typeof recebido !== "string" || recebido === "") return false;
  // Hash dos dois lados: `timingSafeEqual` exige o mesmo tamanho, e o hash o iguala sem vazar o comprimento.
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(segredoDaFonte).digest();
  return timingSafeEqual(a, b);
}

const SEM_ACENTO = /[̀-ͯ]/g;

/**
 * O trabalho comprado, pelo NOME do produto na Cakto ("Trabalho Espiritual: Abertura do
 * Coração" → `abertura-do-coracao`). `null` = produto que não é um dos trabalhos: a compra é
 * registrada, mas o entregável personalizado não sabe qual montar.
 */
export function slugDoTrabalho(produtoNome: string | null): string | null {
  if (produtoNome === null) return null;
  const n = produtoNome.normalize("NFD").replace(SEM_ACENTO, "").toLowerCase();
  if (n.includes("abertura do coracao")) return "abertura-do-coracao";
  if (n.includes("abertura da prosperidade")) return "abertura-da-prosperidade";
  if (n.includes("limpeza e protecao")) return "limpeza-e-protecao";
  if (n.includes("desbloqueio dos caminhos")) return "desbloqueio-dos-caminhos";
  return null;
}
