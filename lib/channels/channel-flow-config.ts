import { z } from "zod";

export const channelHandlingModeSchema = z.enum(["ai", "flow", "human"]);
export type ChannelHandlingMode = z.infer<typeof channelHandlingModeSchema>;

export const channelFlowConfigSchema = z.object({
  handling_mode: channelHandlingModeSchema.default("ai"),
  default_flow_pointer_id: z.string().uuid().nullable().optional(),
});

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
