import { describe, expect, it } from "vitest";

import { reciboDeEntrega } from "./recibo-de-entrega";

describe("reciboDeEntrega", () => {
  it("⭐ canal oficial: status fica 'sent' e a hora de entrega ou de leitura decide o recibo", () => {
    expect(reciboDeEntrega({ status: "sent", delivered_at: null, read_at: null })).toBe("sent");
    expect(reciboDeEntrega({ status: "sent", delivered_at: "2026-10-12T18:31:14Z", read_at: null })).toBe("delivered");
    expect(reciboDeEntrega({ status: "sent", delivered_at: "2026-10-12T18:31:14Z", read_at: "2026-10-12T18:31:14Z" })).toBe("read");
    // `read` sem `delivered` (a Meta não garante a ordem): é lida.
    expect(reciboDeEntrega({ status: "sent", read_at: "2026-10-12T18:31:14Z" })).toBe("read");
  });

  it("canal que grava o detalhe em `status` continua valendo", () => {
    expect(reciboDeEntrega({ status: "delivered" })).toBe("delivered");
    expect(reciboDeEntrega({ status: "read" })).toBe("read");
  });

  it("mensagem que falhou ou ainda está saindo não tem recibo", () => {
    expect(reciboDeEntrega({ status: "failed", delivered_at: "2026-10-12T18:31:14Z" })).toBeNull();
    expect(reciboDeEntrega({ status: "sending" })).toBeNull();
    expect(reciboDeEntrega({ status: "queued" })).toBeNull();
  });
});
