/**
 * O PRESENTE — uma pergunta de tarô que o cliente compra para dar a alguém.
 *
 * Quem recebe abre `/c/<org>/presente/<codigo>`, sem cadastro, e faz UMA
 * pergunta; a resposta vem da IA com uma carta tirada pelo código. O código é o
 * que dá direito à pergunta: 24 bytes aleatórios, e o link é para ser passado
 * adiante pela própria compradora (ela manda pelo WhatsApp dela). A empresa não
 * escreve para quem recebeu — mensagem para quem nunca falou com a empresa é o
 * que derruba número.
 */
import { randomBytes } from "node:crypto";

export const EXTRA_DO_PRESENTE = "presente";
export const FORMA_DO_CODIGO_DO_PRESENTE = /^[A-Za-z0-9_-]{32}$/;

export function gerarCodigoDoPresente(): string {
  return randomBytes(24).toString("base64url");
}

export function caminhoDoPresente(slugDaOrganizacao: string, codigo: string): string {
  return `/c/${slugDaOrganizacao}/presente/${codigo}`;
}
