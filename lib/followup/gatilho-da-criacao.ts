/**
 * Da escolha da tela ao `trigger_config` que o motor lê — e de volta ao texto do card.
 *
 * O diálogo «Novo fluxo» oferece provedor + evento (+ palavra-chave), e o card do
 * gatilho os mostra. Até aqui a escolha vivia só no `localStorage` do navegador:
 * o motor nunca a lia, e outro navegador já via outro gatilho. Agora a escolha VIRA
 * `trigger_config` (persistido, lido pelo motor) e o card é desenhado a partir dele.
 *
 * Só o WhatsApp tem produtor de evento próprio (`gatilho-mensagem.ts`). Os demais
 * provedores (webhook e plataformas de pagamento) entram por «Webhooks»: uma regra
 * usa a ação «Iniciar fluxo de mensagem» — é o `kind: webhook`. A escolha do
 * provedor/evento ali é rótulo de quem montou; o motor NÃO filtra por ela, e a tela
 * precisa dizer isso em vez de prometer um filtro que não existe.
 */
import { EVENTOS_DA_CAKTO, ROTULOS_DOS_EVENTOS_DA_CAKTO, type EventoDaCakto } from "@/lib/pagamentos/eventos-da-cakto";
import type { ParamsDaMensagem } from "./mensagem-casa";

export interface EscolhaDeGatilho {
  provider: string;
  event: string;
  /** Palavras separadas por vírgula ou quebra de linha. */
  keyword: string;
}

export type TriggerConfigGravavel =
  | { kind: "inbound_message"; params: ParamsDaMensagem }
  | { kind: "payment_event"; params: { provider: "cakto"; event: EventoDaCakto } }
  | { kind: "webhook" };

export function palavrasDe(texto: string): string[] {
  return texto
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .slice(0, 20);
}

/** `null` = escolha incompleta (palavra-chave sem palavra): a tela recusa antes de criar. */
export function gatilhoDaEscolha(escolha: EscolhaDeGatilho): TriggerConfigGravavel | null {
  if (escolha.provider === "cakto") {
    const evento = EVENTOS_DA_CAKTO.find((e) => e === escolha.event);
    // Evento fora da lista é escolha incompleta: a tela recusa antes de criar, em vez de gravar um gatilho que nunca dispara.
    return evento === undefined ? null : { kind: "payment_event", params: { provider: "cakto", event: evento } };
  }
  if (escolha.provider !== "whatsapp") return { kind: "webhook" };
  switch (escolha.event) {
    case "inicio_conversa":
      return { kind: "inbound_message", params: { match: "first_message" } };
    case "palavra_chave": {
      const keywords = palavrasDe(escolha.keyword);
      if (keywords.length === 0) return null;
      return { kind: "inbound_message", params: { match: "keyword", keywords, keyword_mode: "equals" } };
    }
    case "mensagem_recebida":
    case "qualquer_mensagem":
    default:
      return { kind: "inbound_message", params: { match: "any" } };
  }
}

export interface GatilhoDescrito {
  providerId: "whatsapp" | "cakto" | "webhook" | "manual" | "outro";
  /** Texto curto do evento; `null` quando não há o que dizer. */
  evento: string | null;
  /** Palavras-chave quando o gatilho é por palavra. */
  palavras: string[];
}

/** O que o card do gatilho mostra, lido do `trigger_config` REAL do fluxo. */
export function descreverGatilho(cfg: Record<string, unknown> | null | undefined): GatilhoDescrito {
  const kind = cfg?.kind;
  if (kind === "inbound_message") {
    const params = (cfg?.params ?? {}) as Partial<ParamsDaMensagem>;
    if (params.match === "keyword") {
      return { providerId: "whatsapp", evento: "Enviou palavra-chave", palavras: params.keywords ?? [] };
    }
    if (params.match === "first_message") {
      return { providerId: "whatsapp", evento: "Início de conversa", palavras: [] };
    }
    return { providerId: "whatsapp", evento: "Qualquer mensagem", palavras: [] };
  }
  if (kind === "payment_event") {
    const evento = (cfg?.params as { event?: EventoDaCakto } | undefined)?.event;
    return { providerId: "cakto", evento: evento ? ROTULOS_DOS_EVENTOS_DA_CAKTO[evento] ?? null : null, palavras: [] };
  }
  if (kind === "inbound_after_silence") {
    return { providerId: "whatsapp", evento: "Retorno após silêncio", palavras: [] };
  }
  if (kind === "webhook") return { providerId: "webhook", evento: "Disparado por Webhooks", palavras: [] };
  if (kind === "manual" || kind === undefined) return { providerId: "manual", evento: "Disparo manual", palavras: [] };
  return { providerId: "outro", evento: null, palavras: [] };
}
