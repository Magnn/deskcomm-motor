/**
 * A cobrança que o canal oficial informa por mensagem (`statuses[].pricing`).
 *
 * O webhook descartava o bloco: quem recebia a fatura não tinha como ligá-la às
 * mensagens. Aqui ficam as duas pontas — o que o parser lê do evento e o que a
 * conversa mostra.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MessageBubble } from "@/components/inbox/MessageBubble";
import { parseMetaWebhook, type MessageStatusEvent } from "@/lib/channels/meta/webhook";
import type { Message } from "@/lib/types/messaging";

function statusCom(extra: Record<string, unknown>): MessageStatusEvent {
  const eventos = parseMetaWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba-1",
        changes: [
          {
            field: "messages",
            value: {
              statuses: [{ id: "wamid.OUT", status: "delivered", recipient_id: "5531", ...extra }],
            },
          },
        ],
      },
    ],
  } as Parameters<typeof parseMetaWebhook>[0]);
  return eventos[0] as MessageStatusEvent;
}

describe("parseMetaWebhook — cobrança da mensagem", () => {
  it("lê cobrada, categoria e regra quando a Meta informa", () => {
    const e = statusCom({
      pricing: { billable: true, pricing_model: "PMP", category: "marketing", type: "regular" },
    });
    expect(e.cobranca).toEqual({ cobrada: true, categoria: "marketing", tipo: "regular" });
  });

  it("mensagem gratuita é informação, não ausência", () => {
    const e = statusCom({
      pricing: { billable: false, category: "service", type: "free_customer_service" },
    });
    expect(e.cobranca).toEqual({
      cobrada: false,
      categoria: "service",
      tipo: "free_customer_service",
    });
  });

  it("sem o bloco, ou sem `billable` booleano, não afirma nada", () => {
    expect(statusCom({}).cobranca).toBeNull();
    expect(statusCom({ pricing: { category: "marketing" } }).cobranca).toBeNull();
    expect(statusCom({ pricing: "x" }).cobranca).toBeNull();
  });
});

function msg(over: Partial<Message> = {}): Message {
  return {
    id: "m1",
    organization_id: "o1",
    conversation_id: "c1",
    channel_session_id: "s1",
    contact_id: "ct1",
    external_id: null,
    type: "text",
    direction: "outbound",
    status: "sent",
    ack: null,
    error_code: null,
    error_message: null,
    body: "corpo da mensagem",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "ai",
    sent_by_user_id: null,
    sent_at: "2026-10-07T12:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    edited_at: null,
    revoked_at: null,
    reply_to_message_id: null,
    created_at: "2026-10-07T12:00:00.000Z",
    ...over,
  } as Message;
}

describe("MessageBubble — marca de cobrança", () => {
  it("mensagem cobrada mostra a categoria ao lado da hora", () => {
    render(
      <MessageBubble message={msg({ billing_billable: true, billing_category: "marketing" })} />,
    );
    expect(screen.getByText("Cobrada · marketing")).toBeInTheDocument();
  });

  it("categoria que o produto não conhece cai em 'Cobrada', sem inventar nome", () => {
    render(
      <MessageBubble message={msg({ billing_billable: true, billing_category: "nova_categoria" })} />,
    );
    expect(screen.getByText("Cobrada")).toBeInTheDocument();
  });

  it("gratuita e não informada não ganham marca", () => {
    const { rerender } = render(
      <MessageBubble message={msg({ billing_billable: false, billing_category: "service" })} />,
    );
    expect(screen.queryByText(/Cobrada/)).toBeNull();
    rerender(<MessageBubble message={msg()} />);
    expect(screen.queryByText(/Cobrada/)).toBeNull();
  });
});
