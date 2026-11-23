/**
 * ⭐ 22/11/2026: a venda de quem veio de anúncio há mais de um mês era recusada pela mensageria ("No CTWA-attributed
 * conversation found") e não chegava à Meta por caminho nenhum. Agora vai UMA vez pelo pixel da tela, pelo telefone.
 *
 * Sabotagem: tirar o `enviarUmaVez(pixel, …)` de `enviar` deixa os dois ⭐ vermelhos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const zernio = vi.hoisted(() => vi.fn());
vi.mock("@/lib/channels/zernio/conversoes", () => ({ enviarConversaoPelaZernio: zernio }));

import { transporteMeta } from "./conversions";

const BASE = {
  organizationId: "org",
  leadId: "lead-1",
  evento: "Purchase" as const,
  eventoId: "avulsa:ref-1:Purchase",
  ocorridoEm: new Date(),
  cliqueDeOrigem: "clique-1",
  telefone: "5569999990000",
  moeda: "BRL",
  valorCentavos: 6000,
  contaDoWhatsApp: "waba",
};
const PIXEL = { datasetId: "965", accessToken: "tok-pixel", testEventCode: null };
const SEM_CONVERSA = JSON.stringify({ error: { code: 100, message: "Invalid parameter", error_user_msg: "No CTWA-attributed conversation found for the given phone number" } });

const chamadas = (f: ReturnType<typeof vi.fn>) => f.mock.calls as unknown as Array<[string, RequestInit]>;

describe("reserva no pixel quando a mensageria não acha a conversa do anúncio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    zernio.mockReset();
  });

  it("⭐ mensageria própria recusa: a mesma compra vai ao pixel da tela como chat, com o mesmo event_id", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response(SEM_CONVERSA, { status: 400 })).mockResolvedValueOnce(Response.json({ events_received: 1, fbtrace_id: "trace-pixel" }));
    vi.stubGlobal("fetch", f);

    const r = await transporteMeta.enviar({ datasetId: "msg-1", accessToken: "tok-msg", testEventCode: null, reservaNoPixel: PIXEL }, BASE);

    expect(r).toMatchObject({ tipo: "ok", detalhe: expect.stringContaining("pixel") });
    expect(r).toMatchObject({ detalhe: expect.stringContaining("trace-pixel") });
    expect(chamadas(f)).toHaveLength(2);
    expect(chamadas(f)[1]![0]).toContain("/965/events");
    expect((chamadas(f)[1]![1].headers as Record<string, string>).authorization).toBe("Bearer tok-pixel");
    const ev = JSON.parse(chamadas(f)[1]![1].body as string).data[0];
    expect(ev).toMatchObject({ action_source: "chat", event_id: "avulsa:ref-1:Purchase", custom_data: { value: 60, currency: "BRL" } });
    expect(ev.user_data).not.toHaveProperty("ctwa_clid");
  });

  it("⭐ intermediário recusa: vai ao pixel da tela que já está na credencial", async () => {
    zernio.mockResolvedValue({ tipo: "permanente", detalhe: "404: invalid_field_value: No CTWA-attributed conversation found for the given phone number" });
    const f = vi.fn(async () => Response.json({ events_received: 1 }));
    vi.stubGlobal("fetch", f);

    const r = await transporteMeta.enviar({ ...PIXEL, intermediario: { accountId: "acc" } as never }, BASE);

    expect(r.tipo).toBe("ok");
    expect(chamadas(f)[0]![0]).toContain("/965/events");
  });

  it("outra recusa não vai ao pixel, e sem reserva fica a recusa da mensageria", async () => {
    const outra = JSON.stringify({ error: { code: 100, message: "Invalid parameter" } });
    const f = vi.fn(async () => new Response(outra, { status: 400 }));
    vi.stubGlobal("fetch", f);
    expect((await transporteMeta.enviar({ datasetId: "msg-1", accessToken: "t", testEventCode: null, reservaNoPixel: PIXEL }, BASE)).tipo).toBe("permanente");
    expect(chamadas(f)).toHaveLength(1);

    const g = vi.fn(async () => new Response(SEM_CONVERSA, { status: 400 }));
    vi.stubGlobal("fetch", g);
    expect((await transporteMeta.enviar({ datasetId: "msg-1", accessToken: "t", testEventCode: null }, BASE)).tipo).toBe("permanente");
    expect(chamadas(g)).toHaveLength(1);
  });
});
