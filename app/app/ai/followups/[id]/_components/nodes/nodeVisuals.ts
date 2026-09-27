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
  VideoCamera,
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
    case "delay":
      return `${t(TIPOS_DE_ITEM_DE_CONTEUDO.delay)} ${item.seconds}s`;
  }
}

/**
 * Visual identity per node type — shared by the palette (Task 6.2 increment 2)
 * and the custom node cards (increment 3). Each type gets a DISTINCT icon +
 * Sage token pairing (never a bare default React Flow box): trigger=accent
 * (start), wait=info (calm/waiting), condition=warning (branch), ai_classify=
 * solid accent (the "smart" step), action=success (send/go), end=error
 * (terminal — reads as "stop", not literally an error).
 */
export interface NodeVisual {
  type: NodeType;
  paletteLabel: string;
  icon: ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  /** Icon chip background + text. */
  chipClassName: string;
  /** Left accent border on the node card. */
  borderClassName: string;
  defaultLabel: string;
  defaultConfig: () => FlowNode["config"];
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
  return { mode: "ai_message", prompt_hint: "Configure esta etapa." };
}

export const NODE_VISUALS: Record<NodeType, NodeVisual> = {
  trigger: {
    type: "trigger",
    paletteLabel: "Gatilho",
    icon: Play,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Início do fluxo",
    defaultConfig: () => ({}),
  },
  wait: {
    type: "wait",
    paletteLabel: "Aguardar",
    icon: Clock,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Aguardar",
    defaultConfig: () => ({ mode: "fixed", duration_ms: 300_000 }),
  },
  condition: {
    type: "condition",
    paletteLabel: "Condição",
    icon: GitBranch,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Verificar condição",
    defaultConfig: () => ({ combinator: "and", checks: [regraEmBranco()] }),
  },
  ai_classify: {
    type: "ai_classify",
    paletteLabel: "Classificar (IA)",
    icon: Brain,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
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
    icon: ChatCircle,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Casar resposta",
    defaultConfig: () => ({
      branches: [{ id: "br_sim", label: "Sim", op: "contains", pattern: "sim" }],
      grace_timeout_ms: 900_000,
    }),
  },
  repeat: {
    type: "repeat",
    paletteLabel: "Repetir",
    icon: ArrowsClockwise,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Repetir pela resposta",
    defaultConfig: () => ({ max_count: 12 }),
  },
  collect: {
    type: "collect",
    paletteLabel: "Pergunta",
    icon: Question,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Nova pergunta",
    defaultConfig: () => ({ key: "novo_campo", label: "Nova pergunta", type: "text", required: true, permite_correcao: true }),
  },
  skill: {
    type: "skill",
    paletteLabel: "Skill",
    icon: PuzzlePiece,
    chipClassName: "bg-accent-soft text-accent",
    borderClassName: "border-l-accent-500",
    defaultLabel: "Puxar skill",
    defaultConfig: () => ({ skill_name: "nome-da-skill" }),
  },
  action: {
    type: "action",
    paletteLabel: "Ação",
    icon: PaperPlaneTilt,
    chipClassName: "bg-success-bg text-success-fg",
    borderClassName: "border-l-success",
    defaultLabel: "Enviar mensagem",
    defaultConfig: () => configPadraoDaAcao(),
  },
  end: {
    type: "end",
    paletteLabel: "Fim",
    icon: Flag,
    chipClassName: "bg-error-bg text-error-fg",
    borderClassName: "border-l-error",
    defaultLabel: "Fim do fluxo",
    defaultConfig: () => ({ outcome: "exhausted" }),
  },
  // ── Lote 1 (aditivo) — comparativo ChatbotX/AcassIA/Desk ──
  ab_split: {
    type: "ab_split",
    paletteLabel: "A/B split",
    icon: TreeStructure,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Dividir tráfego (A/B)",
    defaultConfig: () => ({
      branches: [
        { id: "a", label: "A", percent: 50 },
        { id: "b", label: "B", percent: 50 },
      ],
    }),
  },
  ai_generic: {
    type: "ai_generic",
    paletteLabel: "IA (prompt livre)",
    icon: Sparkle,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
    defaultLabel: "Rodar prompt de IA",
    defaultConfig: () => ({
      prompt: "Resuma em uma frase o que o cliente disse sobre a necessidade dele.",
      save_to: { kind: "lead_custom", key: "resultado_ia" },
    }),
  },
  api_call: {
    type: "api_call",
    paletteLabel: "API externa",
    icon: WebhooksLogo,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Chamar API externa",
    // `example.com`, não `exemplo.com`: RFC 2606, reservado e nunca resolve —
    // o mesmo domínio que a catraca de host de terceiro (branding.test.ts)
    // já isenta de declaração para amostra de formato de campo.
    defaultConfig: () => ({ method: "POST", url: "https://example.com/webhook", headers: [] }),
  },
  notify_agent: {
    type: "notify_agent",
    paletteLabel: "Notificar atendente",
    icon: Bell,
    chipClassName: "bg-warning-bg text-warning-fg",
    borderClassName: "border-l-warning",
    defaultLabel: "Notificar atendente",
    defaultConfig: () => ({ message: "Configure o aviso." }),
  },
  add_note: {
    type: "add_note",
    paletteLabel: "Anotação no contato",
    icon: Note,
    chipClassName: "bg-info-bg text-info-fg",
    borderClassName: "border-l-info",
    defaultLabel: "Anotar no contato",
    defaultConfig: () => ({ body: "Configure a nota." }),
  },
  // Fora da paleta (`NODE_VISUAL_LIST` vem de `NOS_DA_SUPERFICIE`) até o motor existir: a tabela é exaustiva por
  // `NodeType`, mas só entra na paleta o que a superfície executa.
  agent: {
    type: "agent",
    paletteLabel: "Agente de IA",
    icon: Robot,
    chipClassName: "bg-accent text-accent-foreground",
    borderClassName: "border-l-accent-700",
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
    default: {
      const exhaustive: never = type;
      return String(exhaustive);
    }
  }
}
