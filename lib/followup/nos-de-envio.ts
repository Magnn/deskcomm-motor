/**
 * Nós de "envio" que são uma MENSAGEM com forma própria: o `pix_payment` (e o que
 * vier a ser da mesma família).
 *
 * A decisão é não abrir um segundo caminho de envio. O nó Ação em modo `content`
 * já tem tudo o que uma mensagem precisa — cadeia anti-ban, janela, opt-out, envio
 * uma vez só por estadia, recheck e dead-man — e foi provado em produção. Então,
 * ao carregar o grafo, estes nós são BAIXADOS para um `action` equivalente (mesmo
 * id, mesmo rótulo, mesmas arestas), e o motor inteiro passa a tratá-los como o
 * que de fato são: uma mensagem a enviar.
 *
 * Baixar é puro e determinístico: o grafo salvo no banco NÃO muda (o editor segue
 * mostrando o nó de PIX), só a cópia que o motor executa.
 */
import { MODELO_PADRAO_DA_OPENAI } from "@/lib/voz/catalogo-openai";
import type { IdDeProvedorDeVoz, VoiceReplyConfig } from "@/lib/voz/tipos";
import type { FlowGraph, FlowNode } from "./graph-schema";

type PixConfig = Extract<FlowNode, { type: "pix_payment" }>["config"];
type ItemDeTexto = { type: "text"; body: string };

const ROTULO_DA_CHAVE: Record<PixConfig["key_type"], string> = {
  aleatoria: "Chave aleatória",
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
};

/** "97,00" → "R$ 97,00"; o que já vier com moeda ou texto livre fica como está. */
function valorParaExibir(valor: string): string {
  const v = valor.trim();
  if (v === "") return "";
  return /^\d[\d.,]*$/.test(v) ? `R$ ${v}` : v;
}

/**
 * As bolhas do PIX. A chave vai SOZINHA na última: no WhatsApp, quem paga toca e
 * segura a bolha para copiar, e uma chave no meio de uma frase obriga a selecionar
 * à mão — é o que faz a pessoa errar um dígito.
 */
export function bolhasDoPix(config: PixConfig): ItemDeTexto[] {
  const chave = config.pix_key.trim();
  const linhas: string[] = [];
  const intro = config.message_text?.trim();
  if (intro) linhas.push(intro);

  const detalhes: string[] = [];
  const valor = valorParaExibir(config.amount ?? "");
  if (valor) detalhes.push(`*Valor:* ${valor}`);
  const favorecido = config.beneficiary?.trim();
  if (favorecido) detalhes.push(`*Favorecido:* ${favorecido}`);
  if (chave) detalhes.push(`*${ROTULO_DA_CHAVE[config.key_type]}* (chave PIX) na próxima mensagem 👇`);
  if (detalhes.length > 0) linhas.push(detalhes.join("\n"));

  const bolhas: ItemDeTexto[] = [];
  if (linhas.length > 0) bolhas.push({ type: "text", body: linhas.join("\n\n") });
  if (chave) bolhas.push({ type: "text", body: chave });
  return bolhas;
}

type VozConfig = Extract<FlowNode, { type: "voice_studio" }>["config"];

/**
 * As seis vozes "pré-configuradas" que o formulário mostrava antes de existir voz real
 * eram só tons de voz do navegador. Fluxos salvos com esses ids continuam falando —
 * cada um numa voz real da OpenAI do mesmo gênero.
 */
export const VOZ_LEGADA: Record<string, string> = {
  julieta: "coral",
  carla: "nova",
  maria_eduarda: "shimmer",
  marcos_vinicius: "ash",
  joao_pedro: "onyx",
  otavio_luiz: "echo",
};

export type ItemDeVoz = {
  type: "voice";
  text: string;
  provider: IdDeProvedorDeVoz;
  voice_id: string;
  speed?: number;
  stability?: number;
  similarity_boost?: number;
  style?: number;
};

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function itemDeVoz(config: VozConfig): ItemDeVoz | null {
  const text = config.text.trim();
  if (text === "") return null;
  const provider: IdDeProvedorDeVoz = config.provider ?? "openai";
  const voice_id = provider === "openai" ? (VOZ_LEGADA[config.voice_id] ?? config.voice_id) : config.voice_id;
  return {
    type: "voice",
    text,
    provider,
    voice_id,
    // O nó aceita 0.5–2.0; as duas APIs só entendem 0.7–1.2.
    speed: limitar(config.speed, 0.7, 1.2),
    stability: config.stability,
    similarity_boost: config.similarity,
    style: config.style,
  };
}

/** O que `prepararNotasDeVoz` lê de um item de voz — o mesmo contrato da resposta em áudio do agente. */
export function configDeVozDoItem(item: ItemDeVoz): VoiceReplyConfig {
  return {
    enabled: true,
    mode: "mirror",
    min_chars_for_voice: 240,
    provider: item.provider,
    voice_id: item.voice_id,
    ...(item.provider === "openai" ? { model: MODELO_PADRAO_DA_OPENAI } : {}),
    ...(item.speed !== undefined ? { speed: item.speed } : {}),
    ...(item.stability !== undefined ? { stability: item.stability } : {}),
    ...(item.similarity_boost !== undefined ? { similarity_boost: item.similarity_boost } : {}),
    ...(item.style !== undefined ? { style: item.style } : {}),
    max_chars_per_note: 700,
  };
}

function comoAcao(node: FlowNode, items: unknown[]): FlowNode {
  return {
    id: node.id,
    type: "action",
    label: node.label,
    position: node.position,
    config: { mode: "content", items },
  } as FlowNode;
}

function baixarNo(node: FlowNode): FlowNode {
  if (node.type === "voice_studio") {
    const item = itemDeVoz(node.config);
    return item ? comoAcao(node, [item]) : node;
  }
  if (node.type !== "pix_payment") return node;
  const items = bolhasDoPix(node.config);
  // Sem nada a dizer (chave e texto vazios) o publish já barrou; aqui só não
  // fabricamos uma mensagem vazia: o nó vira uma passagem.
  if (items.length === 0) return node;
  return comoAcao(node, items);
}

export function baixarNosDeEnvio(graph: FlowGraph): FlowGraph {
  if (!graph.nodes.some((n) => n.type === "pix_payment" || n.type === "voice_studio")) return graph;
  return { ...graph, nodes: graph.nodes.map(baixarNo) };
}
