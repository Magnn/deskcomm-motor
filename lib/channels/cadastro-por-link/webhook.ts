/**
 * Assinatura do webhook do segundo parceiro — módulo PURO.
 *
 * O payload é o da Meta (webhook `kind: "meta"`), mas a assinatura é dele:
 * header `X-Webhook-Signature`, HMAC-SHA256 em hex do CORPO CRU, sem prefixo
 * `sha256=`. O segredo nasce AQUI na conexão e é entregue ao provedor no
 * registro do webhook; sem ele gravado, a entrada recusa tudo.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const HEADER_ASSINATURA_KAPSO = "x-webhook-signature";

export function verifyKapsoSignature(rawBody: string, assinatura: string | null, segredo: string | null): boolean {
  if (!assinatura || !segredo) return false;
  const hex = assinatura.trim().replace(/^sha256=/, "");
  const esperada = createHmac("sha256", segredo).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(hex, "utf8");
  const b = Buffer.from(esperada, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
