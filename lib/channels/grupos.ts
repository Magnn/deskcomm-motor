/**
 * O TRANSPORTE DE GRUPOS — a única porta por onde o módulo de lançamentos
 * (`lib/lancamentos/`) fala com o WhatsApp.
 *
 * Grupo só existe no canal conectado por QR code. Qual cliente é esse, e como ele
 * monta o envio de uma mídia, é assunto de `lib/channels/`: quem está fora pede
 * "o transporte de grupos" e recebe uma interface, sem saber o provedor.
 */
import { getWahaClient } from "@/lib/waha/client";
import { wahaSendPlanFor, type OutboundMedia } from "@/lib/waha/media-send";

export interface TransporteDeGrupos {
  createGroup(session: string, nome: string, participantes: string[]): Promise<{ id: string }>;
  getGroupInfo(session: string, groupId: string): Promise<{ membros: number; nome: string | null }>;
  getGroupInviteCode(session: string, groupId: string): Promise<string>;
  setGroupDescription(session: string, groupId: string, descricao: string): Promise<void>;
  setGroupAdminsOnly(session: string, groupId: string, somenteAdmins: boolean): Promise<void>;
  sendMessage(session: string, chatId: string, text: string): Promise<unknown>;
  sendMedia(session: string, chatId: string, plan: { endpoint: string; payload: Record<string, unknown> }): Promise<unknown>;
}

/** O transporte de grupos desta instalação — `null` quando o canal por QR code não está configurado. */
export function transporteDeGrupos(): TransporteDeGrupos | null {
  return getWahaClient();
}

/** Como uma mídia vai para um grupo: o endpoint e o corpo que o transporte espera. */
export function planoDeMidiaParaGrupo(
  tipo: "image" | "video" | "audio" | "document",
  midia: OutboundMedia,
): { endpoint: string; payload: Record<string, unknown> } {
  return wahaSendPlanFor(tipo, midia);
}
