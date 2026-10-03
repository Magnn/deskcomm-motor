/**
 * O `state` do login do Facebook — assinado, com prazo, carregando quem pediu a
 * conexão. A construção é a do Instagram (`../instagram/estado.ts`); o que muda é
 * o SEGREDO, derivado com a finalidade: um `state` emitido para conectar o
 * Instagram não abre a volta do Messenger, e vice-versa.
 *
 * A volta chega SEM sessão (o cookie é `SameSite=Strict`): organização e pessoa
 * vêm daqui, nunca de parâmetro que o navegador possa trocar.
 */
import { emitirEstado as emitir, verificarEstado as verificar, type EstadoDoInstagram } from "../instagram/estado";

export type EstadoDoMessenger = EstadoDoInstagram;

/**
 * Segredo curto passa CRU para a construção de lá recusar: o sufixo não pode
 * fazer um `INTERNAL_SECRET` de 8 caracteres parecer longo o bastante.
 */
const comFinalidade = (segredo: string): string => {
  const s = segredo?.trim() ?? "";
  return s.length >= 16 ? `${s}:messenger` : s;
};

export function emitirEstado(
  dados: { organizationId: string; userId: string },
  opcoes: { segredo: string; agora: Date; nonce?: string },
): string {
  return emitir(dados, { ...opcoes, segredo: comFinalidade(opcoes.segredo) });
}

export function verificarEstado(
  token: string | null | undefined,
  opcoes: { segredo: string; agora: Date },
): EstadoDoMessenger | null {
  return verificar(token, { ...opcoes, segredo: comFinalidade(opcoes.segredo) });
}
