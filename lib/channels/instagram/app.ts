/**
 * O APP DO INSTAGRAM DESTA INSTALAÇÃO — e a assinatura dos avisos que ele manda.
 *
 * Um app atende as contas de todas as organizações da instalação (o mesmo desenho
 * do app do WhatsApp oficial): o id, o segredo e o token de verificação são do
 * APP, e vêm do `.env`. Sem os três, o recurso inteiro fica DESLIGADO — as rotas
 * respondem que não está configurado, e nada é aceito no webhook.
 *
 * ⚠️ São o ID e o SEGREDO do produto "Instagram" dentro do app da Meta (em
 * Instagram › Configuração da API com login do Instagram), não os do app da Meta
 * em si. Trocar um pelo outro faz o login do Instagram recusar a volta.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

export interface AppDoInstagram {
  appId: string;
  appSecret: string;
  verifyToken: string;
}

export function appDoInstagram(): AppDoInstagram | null {
  const appId = (env.INSTAGRAM_APP_ID ?? "").trim();
  const appSecret = (env.INSTAGRAM_APP_SECRET ?? "").trim();
  const verifyToken = (env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? "").trim();
  return appId !== "" && appSecret !== "" && verifyToken !== "" ? { appId, appSecret, verifyToken } : null;
}

/** Para onde a Meta devolve o navegador depois do consentimento. Tem de ser IDÊNTICO ao cadastrado no app. */
export function redirectDoInstagram(): string {
  return `${(env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "")}/api/v1/instagram/oauth/callback`;
}

/**
 * O aviso veio da Meta? Ela assina o corpo CRU com o segredo do app e manda em
 * `X-Hub-Signature-256: sha256=<hex>`. Sem cabeçalho, com formato errado ou com
 * assinatura que não bate: recusa.
 */
export function assinaturaDoAvisoConfere(corpoCru: string, cabecalho: string | null, appSecret: string): boolean {
  if (!cabecalho || appSecret === "") return false;
  const [esquema, hex] = cabecalho.trim().split("=");
  if (esquema !== "sha256" || !hex || !/^[0-9a-f]{64}$/i.test(hex)) return false;
  const esperada = createHmac("sha256", appSecret).update(corpoCru, "utf8").digest();
  const recebida = Buffer.from(hex, "hex");
  return recebida.length === esperada.length && timingSafeEqual(recebida, esperada);
}

/** O token do handshake do webhook confere? Tempo constante. */
export function tokenDeVerificacaoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || esperado === "") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
