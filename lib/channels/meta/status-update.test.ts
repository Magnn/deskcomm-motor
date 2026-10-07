import { describe, expect, it } from "vitest";

import { statusUpdate } from "./status-update";
import type { MessageStatusEvent } from "./webhook";

const AGORA = "2026-09-21T12:00:00.000Z";

function evento(over: Partial<MessageStatusEvent>): MessageStatusEvent {
  return {
    kind: "message_status",
    wabaId: "waba-1",
    externalId: "wamid.HBg",
    status: "sent",
    recipient: "5571992894634",
    errorCode: null,
    errorTitle: null,
    ...over,
  };
}

describe("statusUpdate", () => {
  it("guarda o motivo quando a Meta reprova a entrega", () => {
    const u = statusUpdate(
      evento({ status: "failed", errorCode: 131026, errorTitle: "Message Undeliverable" }),
      AGORA,
    );
    expect(u.status).toBe("failed");
    expect(u.error_code).toBe("131026");
    expect(u.error_message).toBe("Message Undeliverable");
  });

  it("carimba entrega e leitura em vez de achatar tudo em sent", () => {
    expect(statusUpdate(evento({ status: "delivered" }), AGORA)).toMatchObject({
      status: "sent",
      delivered_at: AGORA,
    });
    expect(statusUpdate(evento({ status: "read" }), AGORA)).toMatchObject({
      delivered_at: AGORA,
      read_at: AGORA,
    });
  });

  it("não inventa carimbo nem erro no sent cru", () => {
    const u = statusUpdate(evento({ status: "sent" }), AGORA);
    expect(u).toEqual({ status: "sent", updated_at: AGORA });
  });

  it("guarda o que a Meta informou sobre a cobrança da mensagem", () => {
    const u = statusUpdate(
      evento({
        status: "delivered",
        cobranca: { cobrada: true, categoria: "marketing", tipo: "regular" },
      }),
      AGORA,
    );
    expect(u).toMatchObject({
      billing_billable: true,
      billing_category: "marketing",
      billing_type: "regular",
    });
  });

  it("status sem o bloco de cobrança não apaga o que já foi gravado", () => {
    const u = statusUpdate(evento({ status: "read", cobranca: null }), AGORA);
    expect(u).not.toHaveProperty("billing_billable");
    expect(u).not.toHaveProperty("billing_category");
    expect(u).not.toHaveProperty("billing_type");
  });
});
