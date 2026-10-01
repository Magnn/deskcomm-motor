import { describe, expect, it } from "vitest";

import {
  channelFlowConfigSchema,
  estamparConfigDeFluxoNoMetadata,
  lerConfigDeFluxoDoCanal,
  quemAtendeONumero,
} from "./channel-flow-config";

const FLUXO = "22222222-2222-4222-8222-222222222222";

describe("configuração de quem atende o número", () => {
  it("modo fluxo SEM dizer qual fluxo é recusado — o número ficaria sem ninguém", () => {
    expect(channelFlowConfigSchema.safeParse({ handling_mode: "flow" }).success).toBe(false);
    expect(channelFlowConfigSchema.safeParse({ handling_mode: "flow", default_flow_pointer_id: null }).success).toBe(false);
  });

  it("modo fluxo com o fluxo: aceito, e o fluxo fica guardado", () => {
    expect(channelFlowConfigSchema.parse({ handling_mode: "flow", default_flow_pointer_id: FLUXO })).toEqual({
      handling_mode: "flow",
      default_flow_pointer_id: FLUXO,
    });
  });

  it.each(["ai", "human"] as const)("modo %s não guarda fluxo, mesmo que o cliente mande um", (modo) => {
    expect(channelFlowConfigSchema.parse({ handling_mode: modo, default_flow_pointer_id: FLUXO })).toEqual({
      handling_mode: modo,
      default_flow_pointer_id: null,
    });
  });

  it("gravar não apaga o resto do metadata do número", () => {
    expect(
      estamparConfigDeFluxoNoMetadata({ ai_gate: "allowlist" }, { handling_mode: "human", default_flow_pointer_id: null }),
    ).toEqual({ ai_gate: "allowlist", handling_mode: "human", default_flow_pointer_id: null });
  });
});

describe("quemAtendeONumero", () => {
  const dono = (metadata: unknown) => quemAtendeONumero(lerConfigDeFluxoDoCanal(metadata));

  it("número nunca configurado é do agente de IA", () => {
    expect(dono(null)).toEqual({ quem: "agente" });
    expect(dono({})).toEqual({ quem: "agente" });
  });

  it("modo fluxo com fluxo: o fluxo, e só ele", () => {
    expect(dono({ handling_mode: "flow", default_flow_pointer_id: FLUXO })).toEqual({ quem: "fluxo", flowId: FLUXO });
  });

  it("dado antigo — só o fluxo gravado, sem modo: vale como fluxo", () => {
    expect(dono({ default_flow_pointer_id: FLUXO })).toEqual({ quem: "fluxo", flowId: FLUXO });
  });

  it("modo fluxo sem fluxo (dado incompleto): ninguém automático — NUNCA o agente", () => {
    expect(dono({ handling_mode: "flow" })).toEqual({ quem: "humano" });
    expect(dono({ handling_mode: "flow", default_flow_pointer_id: "não-é-uuid" })).toEqual({ quem: "humano" });
  });

  it("modo IA com um fluxo esquecido no metadata: é do agente", () => {
    expect(dono({ handling_mode: "ai", default_flow_pointer_id: FLUXO })).toEqual({ quem: "agente" });
  });

  it("modo humano: ninguém automático", () => {
    expect(dono({ handling_mode: "human" })).toEqual({ quem: "humano" });
  });
});
