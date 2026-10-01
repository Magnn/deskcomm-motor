import type { ComponentType } from "react";

import {
  Play,
  Clock,
  GitBranch,
  Brain,
  ChatCircle,
  ArrowsClockwise,
  PaperPlaneTilt,
  Flag,
  Question,
  PuzzlePiece,
  TreeStructure,
  Sparkle,
  WebhooksLogo,
  Bell,
  Note,
  Robot,
  FileText,
  IdentificationCard,
  ImageIcon,
  Microphone,
  UsersThree,
  VideoCamera,
  List,
  Browsers,
  Cpu,
  CheckCircle,
  CreditCard,
  Target,
  Smiley,
} from "@/lib/ui/icons";
import {
  AGENT_NODE_DEFAULT_MAX_TURNS,
  AGENT_NODE_DEFAULT_SILENCE_MINUTES,
  AGENT_NODE_UNSET_ID,
  type ConteudoItem,
  type ConteudoItemType,
  type FlowNode,
  type NodeType,
} from "@/lib/followup/graph-schema";
import { RESULTADOS_DO_FIM, TIPOS_DE_ITEM_DE_CONTEUDO } from "@/lib/followup/vocabulario";
import { NOS_DA_SUPERFICIE } from "@/lib/followup/validate-publish";

type IconeDeItem = ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;

/** Ícone por tipo de item do nó Conteúdo — compartilhado entre o card e o editor (`ConteudoItemsEditor`). */
export const ICONES_DE_ITEM_DE_CONTEUDO: Record<ConteudoItemType, IconeDeItem> = {
  text: ChatCircle,
  image: ImageIcon,
  video: VideoCamera,
  audio: Microphone,
  document: FileText,
  contact: IdentificationCard,
  sticker: Smiley,
  delay: Clock,
};

/**
 * Uma linha por item, para a PRÉVIA REAL do card (não uma frase descrevendo o
 * nó — o conteúdo em si, como uma mini bolha de chat). Mídia mostra o mime ou
 * a legenda; nada aqui baixa o arquivo nem assina URL, é só o que já está no
 * config.
 */
export function descreverItemDeConteudo(item: ConteudoItem, t: (texto: string) => string): string {
  switch (item.type) {
    case "text":
      return item.body;
    case "image":
    case "video":
      return item.caption ? item.caption : t(TIPOS_DE_ITEM_DE_CONTEUDO[item.type]);
    case "audio":
      return t(TIPOS_DE_ITEM_DE_CONTEUDO.audio);
    case "document":
      return item.filename ?? t(TIPOS_DE_ITEM_DE_CONTEUDO.document);
    case "contact":
      return item.name;
    case "sticker":
      return t(TIPOS_DE_ITEM_DE_CONTEUDO.sticker);
    case "delay":
      return `Delay de ${item.seconds} Segundos`;
  }
}

/**
 * Uma cor DISTINTA por tipo de nó (16 matizes, sem repetição) — antes eram só
 * 5 baldes semânticos (accent/info/warning/success/error) para 16 tipos, e o
 * resultado era 4 tipos diferentes todos "warning" (mesma cor, mesmo peso
 * visual): o card não respondia "que tipo é este" à distância, só de perto,
 * lendo o rótulo. Migrado pela auditoria do construtor da AcassIA — mesma
 * ideia (uma cor por tipo, não por família semântica), ver
 * [[acassia-frontend-fluxos-e-agente]]. Cada matiz gera as quatro classes que
 * o card/paleta precisam: `chip` (avatar sólido do cabeçalho), `badge` (selo
 * suave abaixo do rótulo), `hoverBorder` (paleta, ao passar o mouse), `handle`
 * (bolinha de conexão) e `selected` (contorno do card quando selecionado).
 */
const HUES = {
  emerald: {
    chip: "bg-emerald-600 text-white",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    hoverBorder: "hover:border-emerald-500/60",
    handle: "!bg-emerald-600",
    selected: "border-emerald-400 dark:border-emerald-600 ring-emerald-500/20",
    iconColor: "text-emerald-600",
  },
  indigo: {
    chip: "bg-indigo-600 text-white",
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    hoverBorder: "hover:border-indigo-500/60",
    handle: "!bg-indigo-600",
    selected: "border-indigo-400 dark:border-indigo-600 ring-indigo-500/20",
    iconColor: "text-indigo-600",
  },
  purple: {
    chip: "bg-purple-600 text-white",
    badge: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    hoverBorder: "hover:border-purple-500/60",
    handle: "!bg-purple-600",
    selected: "border-purple-400 dark:border-purple-600 ring-purple-500/20",
    iconColor: "text-purple-600",
  },
  violet: {
    chip: "bg-violet-600 text-white",
    badge: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    hoverBorder: "hover:border-violet-500/60",
    handle: "!bg-violet-600",
    selected: "border-violet-400 dark:border-violet-600 ring-violet-500/20",
    iconColor: "text-violet-600",
  },
  fuchsia: {
    chip: "bg-fuchsia-600 text-white",
    badge: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
    hoverBorder: "hover:border-fuchsia-500/60",
    handle: "!bg-fuchsia-600",
    selected: "border-fuchsia-400 dark:border-fuchsia-600 ring-fuchsia-500/20",
    iconColor: "text-fuchsia-600",
  },
  sky: {
    chip: "bg-sky-600 text-white",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    hoverBorder: "hover:border-sky-500/60",
    handle: "!bg-sky-600",
    selected: "border-sky-400 dark:border-sky-600 ring-sky-500/20",
    iconColor: "text-sky-600",
  },
  cyan: {
    chip: "bg-cyan-600 text-white",
    badge: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    hoverBorder: "hover:border-cyan-500/60",
    handle: "!bg-cyan-600",
    selected: "border-cyan-400 dark:border-cyan-600 ring-cyan-500/20",
    iconColor: "text-cyan-600",
  },
  teal: {
    chip: "bg-teal-600 text-white",
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
    hoverBorder: "hover:border-teal-500/60",
    handle: "!bg-teal-600",
    selected: "border-teal-400 dark:border-teal-600 ring-teal-500/20",
    iconColor: "text-teal-600",
  },
  amber: {
    chip: "bg-amber-600 text-white",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    hoverBorder: "hover:border-amber-500/60",
    handle: "!bg-amber-600",
    selected: "border-amber-400 dark:border-amber-600 ring-amber-500/20",
    iconColor: "text-amber-600",
  },
  lime: {
    chip: "bg-lime-600 text-white",
    badge: "bg-lime-500/10 text-lime-700 dark:text-lime-400",
    hoverBorder: "hover:border-lime-500/60",
    handle: "!bg-lime-600",
    selected: "border-lime-400 dark:border-lime-600 ring-lime-500/20",
    iconColor: "text-lime-600",
  },
  orange: {
    chip: "bg-orange-600 text-white",
    badge: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    hoverBorder: "hover:border-orange-500/60",
    handle: "!bg-orange-600",
    selected: "border-orange-400 dark:border-orange-600 ring-orange-500/20",
    iconColor: "text-orange-600",
  },
  pink: {
    chip: "bg-pink-600 text-white",
    badge: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
    hoverBorder: "hover:border-pink-500/60",
    handle: "!bg-pink-600",
    selected: "border-pink-400 dark:border-pink-600 ring-pink-500/20",
    iconColor: "text-pink-600",
  },
  blue: {
    chip: "bg-blue-600 text-white",
    badge: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    hoverBorder: "hover:border-blue-500/60",
    handle: "!bg-blue-600",
    selected: "border-blue-400 dark:border-blue-600 ring-blue-500/20",
    iconColor: "text-blue-600",
  },
  rose: {
    chip: "bg-rose-600 text-white",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
    hoverBorder: "hover:border-rose-500/60",
    handle: "!bg-rose-600",
    selected: "border-rose-400 dark:border-rose-600 ring-rose-500/20",
    iconColor: "text-rose-600",
  },
  red: {
    chip: "bg-red-600 text-white",
    badge: "bg-red-500/10 text-red-700 dark:text-red-400",
    hoverBorder: "hover:border-red-500/60",
    handle: "!bg-red-600",
    selected: "border-red-400 dark:border-red-600 ring-red-500/20",
    iconColor: "text-red-600",
  },
  yellow: {
    chip: "bg-yellow-600 text-white",
    badge: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
    hoverBorder: "hover:border-yellow-500/60",
    handle: "!bg-yellow-600",
    selected: "border-yellow-400 dark:border-yellow-600 ring-yellow-500/20",
    iconColor: "text-yellow-600",
  },
  zinc: {
    chip: "bg-zinc-700 text-white",
    badge: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
    hoverBorder: "hover:border-zinc-500/60",
    handle: "!bg-zinc-600",
    selected: "border-zinc-400 dark:border-zinc-600 ring-zinc-500/20",
    iconColor: "text-zinc-600",
  },
  slate: {
    chip: "bg-slate-700 text-white",
    badge: "bg-slate-500/10 text-slate-700 dark:text-slate-400",
    hoverBorder: "hover:border-slate-500/60",
    handle: "!bg-slate-600",
    selected: "border-slate-400 dark:border-slate-600 ring-slate-500/20",
    iconColor: "text-slate-600",
  },
} as const satisfies Record<
  string,
  {
    chip: string;
    badge: string;
    hoverBorder: string;
    handle: string;
    selected: string;
    iconColor: string;
  }
>;

type Hue = keyof typeof HUES;

/**
 * Visual identity per node type — shared by the palette, the config panel
 * (`NodeConfigPanel`) and the custom node cards. Cada tipo tem ícone e matiz
 * PRÓPRIOS (ver `HUES` acima) — nunca uma caixa cinza genérica do React Flow.
 */
export interface NodeVisual {
  type: NodeType;
  paletteLabel: string;
  /** Uma linha dizendo o que o nó faz — mostrado na paleta, abaixo do rótulo. */
  paletteDesc: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Avatar sólido do cabeçalho do card / ícone da paleta e do painel de config. */
  chipClassName: string;
  /** Apenas a cor do ícone (sem fundo) — para o item da paleta com fundo neutro. */
  paletteIconClassName: string;
  /** Selo suave (categoria) abaixo do rótulo do card. */
  badgeClassName: string;
  /** Borda ao passar o mouse — usado no item da paleta. */
  hoverBorderClassName: string;
  /** Cor da bolinha de conexão (handle) que este nó emite. */
  handleClassName: string;
  /** Borda + anel quando o card está selecionado no canvas. */
  selectedClassName: string;
  defaultLabel: string;
  defaultConfig: () => FlowNode["config"];
}

function visualDoMatiz(hue: Hue) {
  const h = HUES[hue];
  return {
    chipClassName: h.chip,
    paletteIconClassName: h.iconColor,
    badgeClassName: h.badge,
    hoverBorderClassName: h.hoverBorder,
    handleClassName: h.handle,
    selectedClassName: h.selected,
  };
}

type RegraDeCondicao = Extract<FlowNode, { type: "condition" }>["config"]["checks"][number];

/**
 * A regra com que o nó de condição nasce, e a que o "+ Condição" acrescenta.
 *
 * Era `passos ≥ 0` — válida no schema e VERDADEIRA PARA TODO LEAD (o contador
 * nasce em zero e só soma). No modo uma-saída-por-regra ela desviava todo mundo
 * e tornava "Nenhuma delas" inalcançável; num OU, fixava o nó em "Sim". E o card
 * a mostrava com cara de regra pronta.
 *
 * Agora nasce INCOMPLETA de propósito: o schema aceita (o rascunho salva), o
 * motor nunca a satisfaz e o publish a recusa até alguém escolher a etapa. Etapa
 * porque é a pergunta mais comum de um funil — e a que o seletor responde sem
 * digitar nada.
 */
export function regraEmBranco(): RegraDeCondicao {
  return { field: "lead_stage", op: "eq", value: "" };
}

/**
 * Nó de mensagem novo: IA, salvo o gatilho de retorno — ali o padrão é texto
 * fixo, porque a saudação de quem voltou não pede o LLM (e duas vozes
 * nasceriam se o default fosse `ai_message` + o turno inbound).
 */
export function configPadraoDaAcao(triggerKind?: string): FlowNode["config"] {
  if (triggerKind === "inbound_after_silence") {
    return { mode: "text", body: "Configure esta mensagem." };
  }
  return { mode: "content", items: [] };
}

export const NODE_VISUALS: Record<NodeType, NodeVisual> = {
  trigger: {
    type: "trigger",
    paletteLabel: "Gatilho",
    paletteDesc: "Inicia o fluxo automaticamente",
    icon: Play,
    ...visualDoMatiz("emerald"),
    defaultLabel: "Início do fluxo",
    defaultConfig: () => ({}),
  },
  wait: {
    type: "wait",
    paletteLabel: "Delay",
    paletteDesc: "Aguardar um período",
    icon: Clock,
    ...visualDoMatiz("slate"),
    defaultLabel: "Delay",
    defaultConfig: () => ({ mode: "fixed", duration_ms: 300_000 }),
  },
  condition: {
    type: "condition",
    paletteLabel: "Condição",
    paletteDesc: "Validar uma condição",
    icon: CheckCircle,
    ...visualDoMatiz("red"),
    defaultLabel: "Verificar condição",
    defaultConfig: () => ({ combinator: "and", checks: [regraEmBranco()] }),
  },
  ai_classify: {
    type: "ai_classify",
    paletteLabel: "Classificar (IA)",
    paletteDesc: "IA classifica a resposta",
    icon: Brain,
    ...visualDoMatiz("violet"),
    defaultLabel: "Classificar resposta",
    defaultConfig: () => ({
      // Em português, e dizendo o CRITÉRIO: estes nomes são a definição inteira
      // que o modelo recebe para classificar a resposta (`followup-flow-classify`),
      // e aparecem crus na saída do card, na aresta e no dossiê. "hot"/"cold"
      // pedia ao dono da loja que adivinhasse o critério — e ao modelo também.
      // Fora do dicionário de propósito: são DADO do usuário, e uma chave faria
      // o card traduzir o que o motor compara ao pé da letra.
      classes: ["Interessado", "Sem interesse"],
      grace_timeout_ms: 900_000,
      target: "last_reply",
    }),
  },
  match_reply: {
    type: "match_reply",
    paletteLabel: "Resposta (texto)",
    paletteDesc: "Casa texto da resposta",
    icon: ChatCircle,
    ...visualDoMatiz("red"),
    defaultLabel: "Casar resposta",
    defaultConfig: () => ({
      branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }],
      grace_timeout_ms: 900_000,
    }),
  },
  menu: {
    type: "menu",
    paletteLabel: "Menu",
    paletteDesc: "Menu de opções",
    icon: List,
    ...visualDoMatiz("teal"),
    defaultLabel: "Escolha uma opção",
    defaultConfig: () => ({
      prompt: "Como podemos ajudar?",
      options: [
        { id: "opcao_1", label: "Primeira opção" },
        { id: "opcao_2", label: "Segunda opção" },
      ],
      grace_timeout_ms: 900_000,
    }),
  },
  attendant_route: {
    type: "attendant_route",
    paletteLabel: "Divisão de Atendentes",
    paletteDesc: "Distribuir contatos entre atendentes disponíveis",
    icon: UsersThree,
    ...visualDoMatiz("amber"),
    defaultLabel: "Divisão de Atendentes",
    defaultConfig: () => ({ max_wait_minutes: 30 }),
  },
  repeat: {
    type: "repeat",
    paletteLabel: "Repetir",
    paletteDesc: "Volta e tenta de novo",
    icon: ArrowsClockwise,
    ...visualDoMatiz("teal"),
    defaultLabel: "Repetir pela resposta",
    defaultConfig: () => ({ max_count: 12 }),
  },
  collect: {
    type: "collect",
    paletteLabel: "Pergunta",
    paletteDesc: "Enviar pergunta",
    icon: Question,
    ...visualDoMatiz("amber"),
    defaultLabel: "Pergunta",
    defaultConfig: () => ({
      key: "novo_campo",
      label: "Nova pergunta",
      type: "text",
      required: true,
      permite_correcao: true,
    }),
  },
  skill: {
    type: "skill",
    paletteLabel: "Skill",
    paletteDesc: "Chama uma skill",
    icon: PuzzlePiece,
    ...visualDoMatiz("lime"),
    defaultLabel: "Puxar skill",
    defaultConfig: () => ({ skill_name: "nome-da-skill" }),
  },
  action: {
    type: "action",
    paletteLabel: "Conteúdo",
    paletteDesc: "Enviar mensagem de texto, imagem...",
    icon: Browsers,
    ...visualDoMatiz("purple"),
    defaultLabel: "Conteúdo",
    defaultConfig: () => configPadraoDaAcao(),
  },
  end: {
    type: "end",
    paletteLabel: "Fim",
    paletteDesc: "Encerrar o fluxo",
    icon: Flag,
    ...visualDoMatiz("zinc"),
    defaultLabel: "Fim do fluxo",
    defaultConfig: () => ({ outcome: "exhausted" }),
  },
  // ── Lote 1 (aditivo) — comparativo ChatbotX/AcassIA/Desk ──
  ab_split: {
    type: "ab_split",
    paletteLabel: "Divisão",
    paletteDesc: "Distribuição de contatos",
    icon: TreeStructure,
    ...visualDoMatiz("pink"),
    defaultLabel: "Teste A/B",
    defaultConfig: () => ({
      branches: [
        { id: "a", label: "A", percent: 50 },
        { id: "b", label: "B", percent: 50 },
      ],
    }),
  },
  ai_generic: {
    type: "ai_generic",
    paletteLabel: "GPT",
    paletteDesc: "Gerador de textos GPT",
    icon: Sparkle,
    ...visualDoMatiz("emerald"),
    defaultLabel: "Rodar prompt de IA",
    defaultConfig: () => ({
      prompt: "Resuma em uma frase o que o cliente disse sobre a necessidade dele.",
      save_to: { kind: "lead_custom", key: "resultado_ia" },
    }),
  },
  api_call: {
    type: "api_call",
    paletteLabel: "API Request",
    paletteDesc: "Integrar via requisição HTTP/API",
    icon: PaperPlaneTilt,
    ...visualDoMatiz("purple"),
    defaultLabel: "API Request",
    // `example.com`, não `exemplo.com`: RFC 2606, reservado e nunca resolve —
    // o mesmo domínio que a catraca de host de terceiro (branding.test.ts)
    // já isenta de declaração para amostra de formato de campo.
    defaultConfig: () => ({
      method: "POST",
      url: "https://example.com/webhook",
      headers: [],
      body: "",
      actions: [],
      response_mapping: [],
    }),
  },
  notify_agent: {
    type: "notify_agent",
    paletteLabel: "Notificar Atendente",
    paletteDesc: "Enviar mensagem para atendente.",
    icon: Bell,
    ...visualDoMatiz("blue"),
    defaultLabel: "Notificar atendente",
    defaultConfig: () => ({ message: "Configure o aviso." }),
  },
  add_note: {
    type: "add_note",
    paletteLabel: "Anotação",
    paletteDesc: "Escrever uma anotação",
    icon: Note,
    ...visualDoMatiz("yellow"),
    defaultLabel: "Anotar no contato",
    defaultConfig: () => ({ body: "Configure a nota." }),
  },
  pix_payment: {
    type: "pix_payment",
    paletteLabel: "PIX",
    paletteDesc: "Enviar cobrança via PIX",
    icon: CreditCard,
    ...visualDoMatiz("emerald"),
    defaultLabel: "Editar PIX",
    defaultConfig: () => ({
      key_type: "aleatoria",
      pix_key: "",
    }),
  },
  payment_gateway: {
    type: "payment_gateway",
    paletteLabel: "Pagamento",
    paletteDesc: "Cobrança via gateway",
    icon: CreditCard,
    ...visualDoMatiz("purple"),
    defaultLabel: "Editar Pagamento",
    defaultConfig: () => ({
      currency: "BRL",
      amount: "100,00",
      customer_name: "{full_name}",
      customer_phone: "{phone_number}",
    }),
  },
  whatsapp_template: {
    type: "whatsapp_template",
    paletteLabel: "Template WhatsApp",
    paletteDesc: "Template oficial Meta",
    icon: ChatCircle,
    ...visualDoMatiz("blue"),
    defaultLabel: "Template WhatsApp",
    defaultConfig: () => ({
      template_name: "",
      timeout: 60,
      timeout_unit: "Minutos",
    }),
  },
  meta_pixel: {
    type: "meta_pixel",
    paletteLabel: "Pixel Meta",
    paletteDesc: "Disparar evento do Facebook",
    icon: Target,
    ...visualDoMatiz("amber"),
    defaultLabel: "Editar Pixel",
    defaultConfig: () => ({
      pixel_id: "",
      event_type: "Compra",
      page_id: "",
      item_value: "",
      currency: "BRL",
    }),
  },
  voice_studio: {
    type: "voice_studio",
    paletteLabel: "Voice Studio",
    paletteDesc: "Áudio com IA / ElevenLabs",
    icon: Microphone,
    ...visualDoMatiz("purple"),
    defaultLabel: "Voice Studio",
    defaultConfig: () => ({
      text: "",
      stability: 0.5,
      similarity: 0.7,
      style: 0.5,
      speed: 1.0,
      send_as_voice_note: true,
      voice_id: "julieta",
      voice_name: "Julieta",
    }),
  },
  // Fora da paleta (`NODE_VISUAL_LIST` vem de `NOS_DA_SUPERFICIE`) até o motor existir: a tabela é exaustiva por
  // `NodeType`, mas só entra na paleta o que a superfície executa.
  agent: {
    type: "agent",
    paletteLabel: "Agente IA",
    paletteDesc: "Diálogo autônomo por IA",
    icon: Robot,
    ...visualDoMatiz("purple"),
    defaultLabel: "Agente de IA",
    defaultConfig: () => ({
      agent_id: AGENT_NODE_UNSET_ID,
      objetivo: "Configure o objetivo.",
      max_turnos: AGENT_NODE_DEFAULT_MAX_TURNS,
      silencio_minutos: AGENT_NODE_DEFAULT_SILENCE_MINUTES,
    }),
  },
};

/**
 * A paleta do editor de follow-up: só o que o motor do RELÓGIO executa. Pergunta
 * e Skill são do roteiro de atendimento (#1130) e ficam fora — a mesma lista
 * que o publish cobra (`NOS_DA_SUPERFICIE`), para a tela não oferecer caixa que
 * o publish recusa.
 */
export const NODE_VISUAL_LIST = NOS_DA_SUPERFICIE.followup.map((tipo) => NODE_VISUALS[tipo]);

type ConfigOf<T extends NodeType> = Extract<FlowNode, { type: T }>["config"];

/** "15 min", com espaço — o mesmo formato do card de espera, que dizia "5 min" enquanto este dizia "15min". */
function minutos(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

/**
 * One-line summary of a node's config — shown as the card subtitle. Takes the
 * RF node's own `type`/`data.config` pair (not a reconstructed `FlowNode`)
 * because the node components only ever see React Flow's generic shape.
 */
export function describeNodeConfig(
  type: NodeType,
  config: FlowNode["config"],
  // `t` OBRIGATÓRIO. Era opcional com padrão identidade, e foi assim que dois
  // cards que chegaram por outra branch (repetir e casar resposta) ficaram sem
  // tradução nenhuma sem o typecheck notar: em português o padrão devolve o
  // mesmo texto, então o esquecimento só aparecia para quem usa espanhol.
  t: (texto: string) => string,
): string {
  switch (type) {
    case "trigger":
      return t("Início do fluxo");
    case "wait": {
      const c = config as ConfigOf<"wait">;
      return c.mode === "fixed"
        ? minutos(c.duration_ms)
        : `${Math.round(c.min_ms / 60_000)}–${minutos(c.max_ms)} ${t("(adaptativo)")}`;
    }
    case "condition": {
      const c = config as ConfigOf<"condition">;
      // No modo uma-saída-por-regra o combinador NÃO é consultado (a regra não
      // vota, ela roteia). Continuar anunciando "E"/"OU" ali seria o card
      // afirmando uma coisa que o motor ignora — e o usuário acredita no card.
      if (c.branching === "per_check")
        return `${c.checks.length} ${c.checks.length === 1 ? t("regra · uma saída por regra") : t("regras · uma saída por regra")}`;
      return `${c.checks.length} ${c.checks.length === 1 ? t("condição") : t("condições")} · ${c.combinator === "and" ? t("E") : t("OU")}`;
    }
    // "grace" é o nome do CAMPO, não palavra nenhuma para quem tem uma loja — e o
    // formulário do mesmo nó já perguntava "Esperar a resposta por (minutos)".
    // O card dizia o número com dois nomes na mesma tela.
    case "ai_classify": {
      const c = config as ConfigOf<"ai_classify">;
      return `${c.classes.length} ${c.classes.length === 1 ? t("classe · espera") : t("classes · espera")} ${minutos(c.grace_timeout_ms)}`;
    }
    case "match_reply": {
      const c = config as ConfigOf<"match_reply">;
      return `${c.branches.length} ${c.branches.length === 1 ? t("regra · espera") : t("regras · espera")} ${minutos(c.grace_timeout_ms)}${
        c.save_to
          ? ` · ${t("grava resposta")}${c.if_exists === "skip" ? ` · ${t("pula se já existir")}` : c.if_exists === "confirm" ? ` · ${t("confirma se já existir")}` : ""}`
          : ""
      }`;
    }
    case "menu": {
      const c = config as ConfigOf<"menu">;
      return `${c.options.length} ${t("opções · espera")} ${minutos(c.grace_timeout_ms)}`;
    }
    case "attendant_route": {
      const c = config as ConfigOf<"attendant_route">;
      return `${t("Aguarda até")} ${c.max_wait_minutes} ${t("min pela atribuição")}`;
    }
    case "repeat": {
      const c = config as ConfigOf<"repeat">;
      return `${t("até")} ${c.max_count} ${c.max_count === 1 ? t("volta") : t("voltas")}`;
    }
    case "collect": {
      const c = config as ConfigOf<"collect">;
      return `${c.label} · ${c.required ? t("obrigatória") : t("opcional")}`;
    }
    case "skill": {
      const c = config as ConfigOf<"skill">;
      return c.skill_name;
    }
    case "action": {
      const c = config as ConfigOf<"action">;
      if (c.mode === "ai_message") return c.prompt_hint;
      if (c.mode === "text") return c.body;
      if (c.mode === "template") return t("Template fixo");
      return `${c.items.length} ${c.items.length === 1 ? t("item") : t("itens")}`;
    }
    case "end": {
      const c = config as ConfigOf<"end">;
      return t(RESULTADOS_DO_FIM[c.outcome]);
    }
    case "ab_split": {
      const c = config as ConfigOf<"ab_split">;
      return c.branches.map((b) => `${b.label} ${b.percent}%`).join(" · ");
    }
    case "ai_generic": {
      const c = config as ConfigOf<"ai_generic">;
      return c.prompt;
    }
    case "api_call": {
      const c = config as ConfigOf<"api_call">;
      if (c.actions && c.actions.length > 0) {
        return `${c.actions.length} ${c.actions.length === 1 ? t("ação") : t("ações")}`;
      }
      return `${c.method} ${c.url}`;
    }
    case "notify_agent": {
      const c = config as ConfigOf<"notify_agent">;
      return c.message;
    }
    case "add_note": {
      const c = config as ConfigOf<"add_note">;
      return c.body;
    }
    case "agent": {
      const c = config as ConfigOf<"agent">;
      return c.objetivo;
    }
    case "pix_payment": {
      const c = config as ConfigOf<"pix_payment">;
      return `${t("PIX")} ${c.amount ? `· R$ ${c.amount}` : ""} · ${c.pix_key || t("Sem chave")}`;
    }
    case "payment_gateway": {
      const c = config as ConfigOf<"payment_gateway">;
      return `${c.currency} ${c.open_amount ? t("Valor aberto") : c.amount}`;
    }
    case "whatsapp_template": {
      const c = config as ConfigOf<"whatsapp_template">;
      return `${c.template_name || t("Sem template")} · ${c.timeout} ${t(c.timeout_unit)}`;
    }
    case "meta_pixel": {
      const c = config as ConfigOf<"meta_pixel">;
      return `${c.event_type || t("Pixel")}${c.item_value ? ` · ${c.item_value}` : ""}`;
    }
    case "voice_studio": {
      const c = config as ConfigOf<"voice_studio">;
      const snippet = c.text ? (c.text.length > 25 ? `${c.text.slice(0, 25)}...` : c.text) : t("Sem texto");
      return `${c.voice_name || "Julieta"}: "${snippet}"`;
    }
    default: {
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}
