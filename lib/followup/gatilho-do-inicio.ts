/**
 * A caixa "Início" decide se a mensagem que chegou faz o contato ENTRAR no fluxo.
 *
 * Vale para o número vinculado a um fluxo (`lib/channels/channel-flow-config.ts`):
 * a mensagem chega, o número é do fluxo, e a pergunta é "esta mensagem abre o
 * fluxo para este contato?". Quem já está no meio do fluxo não passa por aqui —
 * a resposta dele avança a inscrição que existe.
 *
 * Pura de propósito: é a regra, sem banco.
 */
import {
  EVENTOS_WHATSAPP_DO_INICIO,
  type EventoWhatsappDoInicio,
  type FlowGraph,
  type TriggerNodeConfig,
} from "./graph-schema";

/** Minúsculas, sem acento, espaços colapsados — "Quero  COMPRAR" casa "quero comprar". */
export function normalizarParaGatilho(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O evento WhatsApp que a caixa pede. Caixa vazia (fluxo antigo, ou caixa nunca
 * editada) = qualquer mensagem: é o que o número vinculado já fazia antes de a
 * caixa ter configuração. Origem que não é WhatsApp devolve `null` — não é uma
 * mensagem que abre esse fluxo.
 */
export function eventoWhatsappDoInicio(config: TriggerNodeConfig | undefined): EventoWhatsappDoInicio | null {
  const origem = config?.integration ?? "whatsapp";
  if (origem !== "whatsapp") return null;
  if (config?.event === undefined) {
    // Sem evento escolhido: palavra-chave preenchida já diz o que se quis.
    return config?.keyword?.trim() ? "keyword" : "message_received";
  }
  return (EVENTOS_WHATSAPP_DO_INICIO as readonly string[]).includes(config.event)
    ? (config.event as EventoWhatsappDoInicio)
    : null;
}

export type DecisaoDoInicio =
  | { entra: true }
  | { entra: false; motivo: "origem_nao_e_mensagem" | "palavra_chave_nao_casou" | "palavra_chave_vazia" | "nao_e_o_primeiro_contato" };

export function mensagemAbreOFluxo(
  config: TriggerNodeConfig | undefined,
  mensagem: { texto: string | null | undefined; primeiraDoContato: boolean },
): DecisaoDoInicio {
  const evento = eventoWhatsappDoInicio(config);
  if (evento === null) return { entra: false, motivo: "origem_nao_e_mensagem" };
  if (evento === "message_received") return { entra: true };
  if (evento === "inicio_conversa") {
    return mensagem.primeiraDoContato ? { entra: true } : { entra: false, motivo: "nao_e_o_primeiro_contato" };
  }
  const palavra = normalizarParaGatilho(config?.keyword ?? "");
  if (palavra === "") return { entra: false, motivo: "palavra_chave_vazia" };
  return normalizarParaGatilho(mensagem.texto ?? "").includes(palavra)
    ? { entra: true }
    : { entra: false, motivo: "palavra_chave_nao_casou" };
}

/** A configuração da caixa "Início" de um grafo (o primeiro gatilho; o publish garante que é um só). */
export function configDoInicio(graph: Pick<FlowGraph, "nodes">): TriggerNodeConfig | undefined {
  const inicio = graph.nodes.find((n) => n.type === "trigger");
  return inicio?.type === "trigger" ? inicio.config : undefined;
}
