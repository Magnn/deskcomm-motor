/**
 * Contato e figurinha do nó "Conteúdo", da borda do motor até o que cada canal
 * recebe. O que este teste prende:
 *   1. `corpoDoEnvio` manda o cartão como `type: 'contact'` com
 *      `metadata.shared_contact` (o MESMO formato do envio manual), sem `body`;
 *   2. figurinha vai como `type: 'sticker'`, com o path, e nunca com legenda;
 *   3. no canal oficial a figurinha é o objeto `sticker` da Cloud API — sem este
 *      caso ela caía no `default` e chegava como DOCUMENTO;
 *   4. no transporte sem endpoint de figurinha, o .webp sai por `sendImage` sem
 *      legenda (imagem), nunca por `sendFile` (anexo).
 */
import { describe, expect, it } from "vitest";

import { corpoDoEnvio } from "@/lib/agent-engine/edge/crm/send-message";
import { mediaPayload } from "@/lib/channels/adapters/meta-cloud";
import type { OutboundEnvelope } from "@/lib/channels/types";
import { wahaSendPlanFor } from "@/lib/waha/media-send";

const base = { tenantId: "org-1", leadId: "lead-1", jobId: "job-1", seq: 2, conversationId: "conv-1" };

describe("corpoDoEnvio — cartão de contato", () => {
  it("vai como type 'contact' com shared_contact no metadata, sem body", () => {
    const corpo = corpoDoEnvio(
      { ...base, body: "[contato] Suporte +5511999998888", contact: { name: "Suporte", phoneNumber: "+5511999998888" } },
      "chave",
    );
    expect(corpo).toMatchObject({
      conversation_id: "conv-1",
      type: "contact",
      metadata: { idempotency_key: "chave", shared_contact: { name: "Suporte", phone_number: "+5511999998888" } },
    });
    expect(corpo).not.toHaveProperty("body");
    expect(corpo).not.toHaveProperty("media_storage_path");
  });

  it("controle: texto comum não ganha shared_contact", () => {
    const corpo = corpoDoEnvio({ ...base, body: "oi" }, "chave");
    expect(corpo).toMatchObject({ type: "text", body: "oi", metadata: { idempotency_key: "chave" } });
    expect(corpo.metadata).not.toHaveProperty("shared_contact");
  });
});

describe("corpoDoEnvio — figurinha", () => {
  it("vai como type 'sticker' com o path, e sem body mesmo se vier texto", () => {
    const corpo = corpoDoEnvio(
      {
        ...base,
        body: "legenda que não existe",
        media: { storagePath: "org-1/conv-1/conteudo-job-1-2.webp", mime: "image/webp", kind: "sticker" },
      },
      "chave",
    );
    expect(corpo).toMatchObject({
      type: "sticker",
      media_storage_path: "org-1/conv-1/conteudo-job-1-2.webp",
      media_mime: "image/webp",
    });
    expect(corpo).not.toHaveProperty("body");
  });

  it("controle: imagem com legenda continua levando a legenda como body", () => {
    const corpo = corpoDoEnvio(
      { ...base, body: "olha só", media: { storagePath: "org-1/conv-1/a.jpg", mime: "image/jpeg", kind: "image" } },
      "chave",
    );
    expect(corpo).toMatchObject({ type: "image", body: "olha só" });
  });
});

describe("figurinha em cada canal", () => {
  const envelope = {
    kind: "sticker",
    media: { url: "https://signed.example/f.webp?token=t", mime: "image/webp", filename: "f.webp", caption: null },
  } as unknown as OutboundEnvelope;

  it("canal oficial: objeto `sticker` só com o link — não documento, não legenda", () => {
    expect(mediaPayload(envelope)).toEqual({
      type: "sticker",
      sticker: { link: "https://signed.example/f.webp?token=t" },
    });
  });

  it("transporte sem endpoint de figurinha: sendImage sem legenda, nunca sendFile", () => {
    const plano = wahaSendPlanFor("sticker", {
      url: "https://signed.example/f.webp?token=t",
      mime: "image/webp",
      filename: "f.webp",
      caption: "não deve sair",
    });
    expect(plano.endpoint).toBe("sendImage");
    expect(plano.payload).not.toHaveProperty("caption");
  });
});
