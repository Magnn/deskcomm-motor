import { z } from "zod";

/**
 * QUEM ATENDE UM NÚMERO.
 *
 * Um número tem UM dono por vez: um fluxo (sem IA), o agente de IA, ou só gente.
 * A escolha mora no próprio número (`channel_sessions.metadata`) — é a única
 * fonte da verdade. A tela de Conexões e o painel do gatilho, dentro do fluxo,
 * editam ESTE mesmo dado; nenhum dos dois guarda uma cópia.
 */
export const channelHandlingModeSchema = z.enum(["ai", "flow", "human"]);
export type ChannelHandlingMode = z.infer<typeof channelHandlingModeSchema>;

export const channelFlowConfigSchema = z
  .object({
    handling_mode: channelHandlingModeSchema.default("ai"),
    default_flow_pointer_id: z.string().uuid().nullable().optional(),
  })
  // "Fluxo" sem dizer QUAL não é escolha: o número ficaria sem ninguém.
  .refine((c) => c.handling_mode !== "flow" || typeof c.default_flow_pointer_id === "string", {
    path: ["default_flow_pointer_id"],
    message: "Escolha o fluxo que vai responder este número.",
  })
  // Fora do modo fluxo não sobra fluxo guardado: um id esquecido ali voltaria a
  // valer no dia em que alguém regravasse o modo.
  .transform((c) => ({
    handling_mode: c.handling_mode,
    default_flow_pointer_id: c.handling_mode === "flow" ? (c.default_flow_pointer_id ?? null) : null,
  }));

export type ChannelFlowConfig = z.infer<typeof channelFlowConfigSchema>;

export function lerConfigDeFluxoDoCanal(metadata: unknown): ChannelFlowConfig {
  if (!metadata || typeof metadata !== "object") {
    return { handling_mode: "ai", default_flow_pointer_id: null };
  }
  const obj = metadata as Record<string, unknown>;
  const rawMode = obj.handling_mode ?? (obj.default_flow_pointer_id ? "flow" : "ai");
  const parsedMode = channelHandlingModeSchema.safeParse(rawMode);
  const handling_mode = parsedMode.success ? parsedMode.data : "ai";
  const default_flow_pointer_id =
    typeof obj.default_flow_pointer_id === "string" && z.string().uuid().safeParse(obj.default_flow_pointer_id).success
      ? obj.default_flow_pointer_id
      : null;
  return { handling_mode, default_flow_pointer_id };
}

export function estamparConfigDeFluxoNoMetadata(
  metadata: unknown,
  config: ChannelFlowConfig,
): Record<string, unknown> {
  const base = metadata && typeof metadata === "object" ? { ...(metadata as Record<string, unknown>) } : {};
  return {
    ...base,
    handling_mode: config.handling_mode,
    default_flow_pointer_id: config.default_flow_pointer_id ?? null,
  };
}

export type QuemAtende =
  /** Ninguém automático: a conversa fica na fila da equipe. */
  | { quem: "humano" }
  /** O fluxo, e SÓ ele: o agente de IA não é chamado. */
  | { quem: "fluxo"; flowId: string }
  /** O agente de IA (que só responde se houver um publicado para o número). */
  | { quem: "agente" };

/**
 * A decisão de roteamento de uma mensagem que chega, a partir da configuração do
 * número. Pura de propósito: é a regra de isolamento, e precisa de teste sem
 * banco. Modo fluxo sem fluxo (dado antigo, gravado antes da validação) cai em
 * "humano" — nunca no agente: quem tirou o número do agente não o quer de volta
 * por um dado incompleto.
 */
export function quemAtendeONumero(config: ChannelFlowConfig): QuemAtende {
  if (config.handling_mode === "human") return { quem: "humano" };
  if (config.handling_mode === "flow") {
    return config.default_flow_pointer_id ? { quem: "fluxo", flowId: config.default_flow_pointer_id } : { quem: "humano" };
  }
  return { quem: "agente" };
}
