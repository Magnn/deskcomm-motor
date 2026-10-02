/**
 * O `state` do login do Instagram — assinado, com prazo, carregando quem pediu a
 * conexão.
 *
 * Mesma construção do `state` da Agenda e do Google Ads (HMAC-SHA256 com
 * `INTERNAL_SECRET`, prazo curto, comparação em tempo constante), duplicada aqui
 * pelo mesmo motivo que elas se duplicam entre si: são eixos sem relação, e uma
 * dependência cruzada surpreenderia quem mexer num sem saber do outro.
 *
 * A volta do consentimento chega SEM sessão (o cookie é `SameSite=Strict` e não
 * viaja numa navegação vinda de outro site). A organização e a pessoa vêm daqui —
 * nunca de um parâmetro que o navegador possa trocar.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const VALIDADE_DO_ESTADO_MS = 10 * 60 * 1000;
const TAMANHO_MINIMO_DO_SEGREDO = 16;

export interface EstadoDoInstagram {
  organizationId: string;
  userId: string;
  nonce: string;
  expiraEmMs: number;
}

function segredoValido(segredo: string): string {
  const s = segredo?.trim() ?? "";
  if (s.length < TAMANHO_MINIMO_DO_SEGREDO) {
    throw new Error("INTERNAL_SECRET ausente ou curto demais: sem ele a volta do Instagram não tem como ser verificada");
  }
  return s;
}

const assinar = (carga: string, segredo: string): Buffer => createHmac("sha256", segredo).update(carga, "utf8").digest();

export function emitirEstado(
  dados: { organizationId: string; userId: string },
  opcoes: { segredo: string; agora: Date; nonce?: string },
): string {
  const segredo = segredoValido(opcoes.segredo);
  const { organizationId, userId } = dados;
  if (!organizationId || !userId || organizationId.includes(".") || userId.includes(".")) {
    throw new Error("state precisa de organizationId e userId, sem ponto");
  }
  const nonce = opcoes.nonce ?? randomBytes(16).toString("hex");
  const carga = `${organizationId}.${userId}.${nonce}.${opcoes.agora.getTime() + VALIDADE_DO_ESTADO_MS}`;
  return `${Buffer.from(carga, "utf8").toString("base64url")}.${assinar(carga, segredo).toString("hex")}`;
}

/** O conteúdo do `state` quando ele é nosso e ainda vale; `null` em qualquer outro caso. */
export function verificarEstado(token: string | null | undefined, opcoes: { segredo: string; agora: Date }): EstadoDoInstagram | null {
  if (!token) return null;
  const segredo = segredoValido(opcoes.segredo);
  const partes = token.split(".");
  if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
  const carga = Buffer.from(partes[0], "base64url").toString("utf8");
  const esperada = assinar(carga, segredo);
  const recebida = Buffer.from(partes[1], "hex");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;

  const campos = carga.split(".");
  if (campos.length !== 4) return null;
  const [organizationId, userId, nonce, expiraTexto] = campos;
  const expiraEmMs = Number(expiraTexto);
  if (!organizationId || !userId || !nonce || !Number.isFinite(expiraEmMs)) return null;
  if (opcoes.agora.getTime() > expiraEmMs) return null;
  return { organizationId, userId, nonce, expiraEmMs };
}
