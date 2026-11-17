/**
 * SÓ DENTRO DA JANELA — a organização que liga `settings.envio.so_dentro_da_janela`
 * não deixa NADA automático (agente, fluxo, campanha, prospecção, lembrete, integração)
 * sair para quem não escreveu nas últimas 24 h NAQUELE número. Vale também no canal que
 * aceitaria texto livre a qualquer hora: é escolha do dono, não limite do canal.
 *
 * A régua é `conversations.last_inbound_at`, e a conversa é por contato + número — então
 * a pessoa que escreveu para o número A não abre o número B. O atendente humano não entra
 * na trava: o que ele manda é decisão dele.
 */
import type { Actor } from "@/lib/api/handlers/types";
import { isWindowOpen } from "@/lib/agent-engine/guardrails/messaging-window";

export function pedeSoDentroDaJanela(settings: unknown): boolean {
  const envio = (settings as { envio?: { so_dentro_da_janela?: unknown } } | null | undefined)?.envio;
  return envio?.so_dentro_da_janela === true;
}

/** Este envio precisa da resposta do ajuste da organização para sair? (Ator humano e janela aberta, não.) */
export function envioDependeDoAjuste(actor: Actor, ultimaEntrada: string | null, agora: Date): boolean {
  return actor.type !== "user" && !isWindowOpen(agora, ultimaEntrada ? new Date(ultimaEntrada) : null);
}
