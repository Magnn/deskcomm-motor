/**
 * BOTÃO "PARAR ATENDIMENTO" — a saída clara, oferecida na hora certa.
 *
 * O circuito tem quatro pontas, e cada teste segura uma: o sistema decide quando oferecer, o canal
 * oficial envia botão de verdade, o toque volta como texto, e esse texto para o agente. Se qualquer
 * uma soltar, o botão vira enfeite — ou pior, a pessoa toca em "Parar" e continua recebendo.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buttonsPayload } from "@/lib/channels/adapters/meta-cloud";
import {
  BOTAO_CONTINUAR,
  BOTAO_PARAR,
  BOTOES_DE_CONTINUAR_OU_PARAR,
  LINHA_SEM_BOTAO,
  canalTemBotaoDeResposta,
  lerBotoesDeResposta,
} from "@/lib/channels/botoes-de-resposta";
import { parseMetaWebhook, textoDoToque } from "@/lib/channels/meta/webhook";
import type { OutboundEnvelope } from "@/lib/channels/types";
import { ehOptOutProvavel, ehPedidoDeOptOut } from "@/lib/opt-out/deteccao";

const envelope = (parte: Partial<OutboundEnvelope>): OutboundEnvelope =>
  ({ organizationId: "o", sessionRef: "123", to: "5511999990000", kind: "text", body: "Quer continuar?", ...parte }) as OutboundEnvelope;

describe("o toque em Parar atendimento PARA o agente", () => {
  it("⭐ o título do botão é reconhecido pela mesma regra que entende a frase digitada", () => {
    expect(ehOptOutProvavel(BOTAO_PARAR.title)).toBe(true);
    expect(ehOptOutProvavel(LINHA_SEM_BOTAO.split(": ")[1]!)).toBe(true);
  });

  it("⭐ Quero continuar segue a conversa, e nenhum dos dois bloqueia o contato sozinho", () => {
    expect(ehOptOutProvavel(BOTAO_CONTINUAR.title)).toBe(false);
    expect(ehPedidoDeOptOut(BOTAO_PARAR.title)).toBe(false);
  });
});

describe("o canal oficial envia botão de verdade", () => {
  it("⭐ texto com botões vira mensagem interativa, com id e título de cada um", () => {
    const corpo = buttonsPayload(envelope({ replyButtons: BOTOES_DE_CONTINUAR_OU_PARAR }));
    expect(corpo).toEqual({
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Quer continuar?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "continuar_atendimento", title: "Quero continuar" } },
            { type: "reply", reply: { id: "parar_atendimento", title: "Parar atendimento" } },
          ],
        },
      },
    });
  });

  it("sem botões, sem corpo, mídia ou corpo acima do teto: sai como antes (null)", () => {
    expect(buttonsPayload(envelope({}))).toBeNull();
    expect(buttonsPayload(envelope({ replyButtons: BOTOES_DE_CONTINUAR_OU_PARAR, body: "  " }))).toBeNull();
    expect(buttonsPayload(envelope({ replyButtons: BOTOES_DE_CONTINUAR_OU_PARAR, kind: "image" }))).toBeNull();
    expect(buttonsPayload(envelope({ replyButtons: BOTOES_DE_CONTINUAR_OU_PARAR, body: "a".repeat(1025) }))).toBeNull();
  });

  it("os títulos cabem no limite da plataforma (20 caracteres)", () => {
    for (const b of BOTOES_DE_CONTINUAR_OU_PARAR) expect(b.title.length).toBeLessThanOrEqual(20);
  });
});

describe("metadata.reply_buttons", () => {
  it("lê o formato certo e recusa o resto — metadata é campo aberto", () => {
    expect(lerBotoesDeResposta({ reply_buttons: [...BOTOES_DE_CONTINUAR_OU_PARAR] })).toEqual([...BOTOES_DE_CONTINUAR_OU_PARAR]);
    expect(lerBotoesDeResposta({})).toBeNull();
    expect(lerBotoesDeResposta({ reply_buttons: [] })).toBeNull();
    expect(lerBotoesDeResposta({ reply_buttons: [{ id: "a", title: "x".repeat(21) }] })).toBeNull();
    expect(lerBotoesDeResposta({ reply_buttons: [{ id: "a", title: "A" }, { id: "a", title: "B" }] })).toBeNull();
    expect(lerBotoesDeResposta({ reply_buttons: [1, 2] })).toBeNull();
    expect(lerBotoesDeResposta({ reply_buttons: Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, title: "ok" })) })).toBeNull();
  });

  it("só o canal oficial tem botão; os demais recebem a linha de texto", () => {
    expect(canalTemBotaoDeResposta("meta_cloud")).toBe(true);
    expect(canalTemBotaoDeResposta("waha")).toBe(false);
    expect(canalTemBotaoDeResposta(null)).toBe(false);
  });
});

describe("o toque volta como texto", () => {
  const recebida = (mensagem: Record<string, unknown>) =>
    parseMetaWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "123" },
                contacts: [{ wa_id: "5511999990000", profile: { name: "Ana" } }],
                messages: [{ id: "wamid.1", from: "5511999990000", timestamp: "1760000000", ...mensagem }],
              },
            },
          ],
        },
      ],
    } as never)[0];

  it("⭐ botão de resposta chega como texto com o título — antes entrava vazio e ninguém lia", () => {
    const evento = recebida({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "parar_atendimento", title: "Parar atendimento" } } });
    expect(evento).toMatchObject({ kind: "inbound_message", type: "text", text: "Parar atendimento" });
  });

  it("item de lista e botão de modelo aprovado também", () => {
    expect(textoDoToque({ type: "interactive", interactive: { list_reply: { id: "x", title: "Opção 2" } } })).toBe("Opção 2");
    expect(textoDoToque({ type: "button", button: { text: "Sim, quero", payload: "p" } })).toBe("Sim, quero");
  });

  it("texto comum e mídia não mudam", () => {
    expect(textoDoToque({ type: "text", text: { body: "oi" } })).toBeNull();
    expect(recebida({ type: "text", text: { body: "oi" } })).toMatchObject({ type: "text", text: "oi" });
    expect(recebida({ type: "audio", audio: { id: "m1", mime_type: "audio/ogg", voice: true } })).toMatchObject({ type: "audio", text: null });
  });
});

describe("a fiação", () => {
  it("⭐ quem decide QUANDO é o sistema: só a chamada que oferece a saída carrega os botões", () => {
    const recuperacao = readFileSync("lib/agent-engine/edge/crm/recuperacao-por-silencio.ts", "utf8");
    expect(recuperacao).toContain("chamada.ofereceSaida ? { offer_stop: true } : {}");
    const envio = readFileSync("lib/agent-engine/edge/crm/send-message.ts", "utf8");
    expect(envio).toContain("recuperacao?.offer_stop === true && input.seq === 1");
  });

  it("o handler entrega os botões ao canal que sabe, e escreve a linha para o que não sabe", () => {
    const handler = readFileSync("app/api/v1/messages/_handler.ts", "utf8");
    expect(handler).toContain("!canalTemBotaoDeResposta(");
    expect(handler).toContain("LINHA_SEM_BOTAO");
    expect(handler).toContain("replyButtons: botoesDeResposta");
  });
});
