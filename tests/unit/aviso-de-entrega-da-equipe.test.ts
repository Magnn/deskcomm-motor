import { describe, expect, it, vi } from "vitest";

/** 11/11/2026: cobrança avulsa que a EQUIPE entrega (vela acesa com vídeo) abre aviso na Central quando é paga. */
const insertMock = vi.fn(async () => undefined);
vi.mock("@/lib/agent-engine/db/repository", async (original) => ({
  ...(await original<typeof import("@/lib/agent-engine/db/repository")>()),
  insertInboxItem: (...a: unknown[]) => insertMock(...(a as [])),
}));

import { avisarEntregaDaEquipe } from "@/lib/agent-engine/agent/inbound-turn";
import { extraSchema } from "@/lib/preco/tipos";

const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } as never;

describe("aviso de entrega da equipe", () => {
  it("⭐ abre um aviso por conversa, com o nome do que foi pago", async () => {
    await avisarEntregaDaEquipe({} as never, "org1", "conv1", "Vela no Seu Nome", log);
    expect(insertMock).toHaveBeenCalledWith(
      expect.anything(),
      "org1",
      expect.objectContaining({ kind: "promise_unfulfilled", refKind: "conversation", refId: "conv1", title: expect.stringContaining("Vela no Seu Nome") }),
      "kind_e_ref",
    );
  });

  it("falha do aviso não derruba o turno", async () => {
    insertMock.mockRejectedValueOnce(new Error("db fora"));
    await expect(avisarEntregaDaEquipe({} as never, "org1", "conv1", "Vela", log)).resolves.toBeUndefined();
  });

  it("o campo é aceito no esquema da cobrança avulsa", () => {
    expect(extraSchema.parse({ name: "Vela no Seu Nome", price_cents: 2700, when: "pede prova", team_delivers: true }).team_delivers).toBe(true);
  });
});
