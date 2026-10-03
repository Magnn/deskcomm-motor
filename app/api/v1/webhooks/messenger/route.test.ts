import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/channels/messenger/app", () => ({ appDoMessenger: vi.fn() }));
vi.mock("@/lib/channels/messenger/ingest", () => ({ ingerirAviso: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import { appDoMessenger } from "@/lib/channels/messenger/app";
import { ingerirAviso } from "@/lib/channels/messenger/ingest";

import { GET, POST } from "./route";

const APP = { appId: "nosso-app", appSecret: "segredo-do-app", verifyToken: "token-verificacao", configId: null };
const URL_BASE = "https://desk.exemplo/api/v1/webhooks/messenger";

const assinar = (corpo: string, segredo = APP.appSecret) => `sha256=${createHmac("sha256", segredo).update(corpo).digest("hex")}`;
const corpo = JSON.stringify({
  object: "page",
  entry: [{ id: "pg-1", messaging: [{ sender: { id: "psid" }, recipient: { id: "pg-1" }, message: { mid: "m1", text: "oi" } }] }],
});
const post = (body: string, assinatura: string | null) =>
  new NextRequest(URL_BASE, { method: "POST", body, headers: assinatura ? { "x-hub-signature-256": assinatura } : {} });

beforeEach(() => {
  vi.mocked(appDoMessenger).mockResolvedValue(APP);
  vi.mocked(ingerirAviso).mockReset().mockResolvedValue({ processados: 1, ignorados: 0 });
});

describe("GET (handshake)", () => {
  it("devolve o challenge em texto puro só com o token certo", async () => {
    const ok = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=token-verificacao&hub.challenge=42`));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("42");
    const errado = await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=42`));
    expect(errado.status).toBe(403);
  });

  it("instalação sem o app configurado não existe para a Meta", async () => {
    vi.mocked(appDoMessenger).mockResolvedValue(null);
    expect((await GET(new NextRequest(`${URL_BASE}?hub.mode=subscribe`))).status).toBe(404);
  });
});

describe("POST (avisos)", () => {
  it("assinatura certa: os eventos vão para a ingestão", async () => {
    const r = await POST(post(corpo, assinar(corpo)));
    expect(r.status).toBe(200);
    expect(ingerirAviso).toHaveBeenCalledTimes(1);
    expect(vi.mocked(ingerirAviso).mock.calls[0]?.[1].eventos).toHaveLength(1);
  });

  it("sem assinatura, ou assinada com outro segredo: 401 e nada é lido", async () => {
    expect((await POST(post(corpo, null))).status).toBe(401);
    expect((await POST(post(corpo, assinar(corpo, "outro-segredo")))).status).toBe(401);
    expect(ingerirAviso).not.toHaveBeenCalled();
  });

  it("aviso sem nada de interesse responde 200 sem gravar (senão a Meta reentrega para sempre)", async () => {
    const vazio = JSON.stringify({ object: "page", entry: [{ id: "pg-1", messaging: [{ sender: { id: "psid" }, recipient: { id: "pg-1" }, reaction: { mid: "m1" } }] }] });
    expect((await POST(post(vazio, assinar(vazio)))).status).toBe(200);
    expect(ingerirAviso).not.toHaveBeenCalled();
  });

  it("falha de escrita responde 500 para a Meta reentregar", async () => {
    vi.mocked(ingerirAviso).mockRejectedValue(new Error("banco fora"));
    expect((await POST(post(corpo, assinar(corpo)))).status).toBe(500);
  });
});
