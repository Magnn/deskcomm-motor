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
  ORIGENS_DO_INICIO,
  triggerNodeConfigSchema,
  type EventoWhatsappDoInicio,
  type FlowGraph,
  type OrigemDoInicio,
  type TriggerNodeConfig,
} from "./graph-schema";

/** Minúsculas, sem acento, espaços colapsados — "Quero  COMPRAR" casa "quero comprar". */
export function normalizarParaGatilho(texto: string): string {
  return texto
    .normalize("NFD")
    // Marcas de acento soltas pelo NFD (U+0300 a U+036F), escritas por código para o
    // editor não as esconder dentro dos colchetes.
    .replace(/\p{Mn}/gu, "")
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

/**
 * A escolha feita no diálogo "Novo fluxo" vira a configuração da caixa "Início".
 *
 * Antes a origem, o evento e a palavra-chave escolhidos ali eram guardados no
 * localStorage do navegador e lidos só pelo CARTÃO: o motor nunca os via, e em
 * outro computador o cartão mostrava outra coisa. Agora a escolha viaja para o
 * construtor (na URL, uma vez) e nasce dentro do nó — o mesmo dado que o motor lê.
 *
 * Origem que não tem motor próprio entra como está (ou como `webhook`, quando nem
 * está no vocabulário): a caixa avisa e a publicação recusa, em vez de fingir.
 */
export function configDoInicioDoNovoFluxo(escolha: {
  provedor: string;
  evento: string;
  palavraChave: string;
}): TriggerNodeConfig {
  const palavra = escolha.palavraChave.trim();
  if (escolha.provedor === "whatsapp") {
    if (palavra !== "") return { integration: "whatsapp", event: "keyword", keyword: palavra.slice(0, 200) };
    if (escolha.evento === "inicio_conversa") return { integration: "whatsapp", event: "inicio_conversa" };
    return { integration: "whatsapp", event: "message_received" };
  }
  const origem = (ORIGENS_DO_INICIO as readonly string[]).includes(escolha.provedor)
    ? (escolha.provedor as OrigemDoInicio)
    : "webhook";
  return { integration: origem, event: escolha.evento.slice(0, 40) };
}

/** Os parâmetros de URL que levam a escolha do diálogo até o construtor. */
export function paramsDoInicio(config: TriggerNodeConfig): string {
  const q = new URLSearchParams();
  if (config.integration) q.set("origem", config.integration);
  if (config.event) q.set("evento", config.event);
  if (config.keyword) q.set("palavra", config.keyword);
  return q.toString();
}

/**
 * Lê de volta, validando pelo schema do nó: URL é entrada de fora, e um valor
 * estranho ali não pode virar config inválida — que impediria o fluxo de salvar.
 */
export function configDoInicioDaUrl(params: { get(nome: string): string | null }): TriggerNodeConfig {
  const origem = params.get("origem");
  const evento = params.get("evento");
  const palavra = params.get("palavra");
  const candidata = {
    ...(origem ? { integration: origem } : {}),
    ...(evento ? { event: evento } : {}),
    ...(palavra ? { keyword: palavra } : {}),
  };
  const lida = triggerNodeConfigSchema.safeParse(candidata);
  return lida.success ? lida.data : {};
}
