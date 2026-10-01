import { describe, it, expect } from "vitest";
import {
  diagnoseNodeError,
  executionLogEntrySchema,
} from "@/lib/followup/execution-logs";
import {
  minigameCampaignSchema,
  drawMinigamePrize,
  computeLuckyWheelTargetRotationDeg,
  type MinigamePrize,
} from "@/lib/engagement/minigames";

describe("Refinamento - Logs e Diagnóstico de Erros", () => {
  it("valida schema de log de execução", () => {
    const entry = executionLogEntrySchema.parse({
      id: "log-1",
      flowId: "flow-abc",
      contactName: "Maria Silva",
      status: "failed",
      startedAt: new Date().toISOString(),
      failedNodeType: "google_sheets",
      errorMessage: "Error: 403 Forbidden - Caller does not have permission",
      executedNodesCount: 3,
    });

    expect(entry.status).toBe("failed");
    expect(entry.executedNodesCount).toBe(3);
  });

  it("diagnostica erros comuns de Google Sheets", () => {
    const diag = diagnoseNodeError("google_sheets", "403 permission denied");
    expect(diag.diagnostic).toContain("Permissão insuficiente");
    expect(diag.recommendation).toContain("Editor");
  });

  it("diagnostica erros comuns de Execute Code", () => {
    const diag = diagnoseNodeError("execute_code", "Execution timeout after 3000ms");
    expect(diag.diagnostic).toContain("excedeu o limite máximo");
    expect(diag.recommendation).toContain("timeout");
  });

  it("diagnostica erros comuns de HTTP / Webhooks", () => {
    const diag = diagnoseNodeError("http_request", "502 Bad Gateway");
    expect(diag.diagnostic).toContain("5xx");
  });
});

describe("Refinamento - Minigames e Roleta Gamificada", () => {
  const mockPrizes: MinigamePrize[] = [
    {
      id: "p1",
      label: "Cupom 10% OFF",
      probabilityWeight: 80,
      couponCode: "DESC10",
      color: "#3b82f6",
      isLosingSlot: false,
    },
    {
      id: "p2",
      label: "Prêmio Especial 50% OFF",
      probabilityWeight: 5,
      couponCode: "SUPER50",
      color: "#eab308",
      isLosingSlot: false,
    },
    {
      id: "p3",
      label: "Tente Novamente",
      probabilityWeight: 15,
      color: "#94a3b8",
      isLosingSlot: true,
    },
  ];

  it("valida schema de campanha gamificada", () => {
    const campaign = minigameCampaignSchema.parse({
      id: "camp-01",
      name: "Roleta do Dia do Consumidor",
      type: "wheel_of_fortune",
      prizes: mockPrizes,
    });

    expect(campaign.name).toBe("Roleta do Dia do Consumidor");
    expect(campaign.prizes.length).toBe(3);
  });

  it("sorteia prêmio baseado em pesos ponderados", () => {
    const prize = drawMinigamePrize(mockPrizes);
    expect(["p1", "p2", "p3"]).toContain(prize.id);
  });

  it("calcula graus de rotação monotonicamente crescentes para o ponteiro", () => {
    const r1 = computeLuckyWheelTargetRotationDeg(0, 4, 1, 5);
    expect(r1).toBeGreaterThan(0);
    // Próximo giro a partir de r1 continua girando para frente
    const r2 = computeLuckyWheelTargetRotationDeg(r1, 4, 2, 5);
    expect(r2).toBeGreaterThan(r1);
  });
});
