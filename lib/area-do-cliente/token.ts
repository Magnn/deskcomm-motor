/**
 * Os segredos da área do cliente: o token do link de acesso, o do cookie de
 * sessão e o código por e-mail. Nenhum deles vai para o banco em claro — só o
 * hash. Quem lê o banco não consegue entrar no lugar de ninguém.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** 32 bytes aleatórios em base64url: o que vai no link e no cookie. */
export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Forma de um token gerado aqui — recusa o lixo antes de ir ao banco. */
export const FORMA_DO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Seis números, sem viés de módulo. */
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * O hash do código leva o contato junto: o mesmo "123456" de duas pessoas não
 * vira o mesmo hash, e um hash vazado não serve para outra conta.
 */
export function hashDoCodigo(codigo: string, contactId: string): string {
  return createHash("sha256").update(`${contactId}:${codigo}`, "utf8").digest("hex");
}

export function codigoConfere(codigo: string, contactId: string, hashGuardado: string): boolean {
  const calculado = Buffer.from(hashDoCodigo(codigo, contactId), "hex");
  const guardado = Buffer.from(hashGuardado, "hex");
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}
