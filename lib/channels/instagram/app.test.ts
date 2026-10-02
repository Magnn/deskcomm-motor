/**
 * A porta do Instagram: o app configurado, a assinatura dos avisos, o `state` da
 * conexão e o formato das chamadas à Meta. O que se cobra é que nada entre sem
 * prova de origem e que nada saia para o endereço errado.
 */
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  env: { INSTAGRAM_APP_ID: "", INSTAGRAM_APP_SECRET: "", INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "", NEXT_PUBLIC_APP_URL: "https://app.exemplo.test/" },
}));
vi.mock("@/lib/env", () => ({ env: h.env }));

const { appDoInstagram, assinaturaDoAvisoConfere, redirectDoInstagram, tokenDeVerificacaoConfere } = await import("./app");
const { emitirEstado, verificarEstado, VALIDADE_DO_ESTADO_MS } = await import("./estado");
const api = await import("./api");

const SEGREDO_DO_APP = "segredo-do-app-do-instagram";

beforeEach(() => {
  h.env.INSTAGRAM_APP_ID = "123456";
  h.env.INSTAGRAM_APP_SECRET = SEGREDO_DO_APP;
  h.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN = "token-que-eu-inventei";
});
afterEach(() => vi.unstubAllGlobals());

describe("o app desta instalação", () => {
  it("só existe com os TRÊS valores — faltando um, o recurso fica desligado", () => {
    expect(appDoInstagram()).toEqual({ appId: "123456", appSecret: SEGREDO_DO_APP, verifyToken: "token-que-eu-inventei" });
    for (const chave of ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "INSTAGRAM_WEBHOOK_VERIFY_TOKEN"] as const) {
      const antes = h.env[chave];
      h.env[chave] = "  ";
      expect(appDoInstagram(), chave).toBeNull();
      h.env[chave] = antes;
    }
  });

  it("o endereço de volta é montado sem barra dobrada", () => {
    expect(redirectDoInstagram()).toBe("https://app.exemplo.test/api/v1/instagram/oauth/callback");
  });
});

describe("a assinatura do aviso", () => {
  const corpo = JSON.stringify({ object: "instagram", entry: [] });
  const assinar = (c: string, segredo = SEGREDO_DO_APP) => `sha256=${createHmac("sha256", segredo).update(c, "utf8").digest("hex")}`;

  it("corpo assinado com o segredo do app: aceita", () => {
    expect(assinaturaDoAvisoConfere(corpo, assinar(corpo), SEGREDO_DO_APP)).toBe(true);
  });

  it("⭐ corpo adulterado, segredo errado, cabeçalho ausente ou malformado: recusa", () => {
    expect(assinaturaDoAvisoConfere(corpo + " ", assinar(corpo), SEGREDO_DO_APP)).toBe(false);
    expect(assinaturaDoAvisoConfere(corpo, assinar(corpo, "outro-segredo"), SEGREDO_DO_APP)).toBe(false);
    expect(assinaturaDoAvisoConfere(corpo, null, SEGREDO_DO_APP)).toBe(false);
    expect(assinaturaDoAvisoConfere(corpo, "sha1=abc", SEGREDO_DO_APP)).toBe(false);
    expect(assinaturaDoAvisoConfere(corpo, "sha256=nao-e-hex", SEGREDO_DO_APP)).toBe(false);
    expect(assinaturaDoAvisoConfere(corpo, assinar(corpo), "")).toBe(false);
  });

  it("o token do handshake confere só quando é idêntico", () => {
    expect(tokenDeVerificacaoConfere("token-que-eu-inventei", "token-que-eu-inventei")).toBe(true);
    expect(tokenDeVerificacaoConfere("token-que-eu-inventeI", "token-que-eu-inventei")).toBe(false);
    expect(tokenDeVerificacaoConfere(null, "token-que-eu-inventei")).toBe(false);
    expect(tokenDeVerificacaoConfere("", "")).toBe(false);
  });
});

describe("o state da conexão", () => {
  const SEGREDO = "segredo-interno-da-instalacao";
  const AGORA = new Date("2026-10-02T15:00:00Z");
  const quem = { organizationId: "org-1", userId: "user-1" };

  it("emitido e verificado: devolve quem pediu a conexão", () => {
    const token = emitirEstado(quem, { segredo: SEGREDO, agora: AGORA });
    expect(verificarEstado(token, { segredo: SEGREDO, agora: AGORA })).toMatchObject(quem);
  });

  it("⭐ adulterado, de outro segredo ou vencido: null", () => {
    const token = emitirEstado(quem, { segredo: SEGREDO, agora: AGORA });
    const [carga, assinatura] = token.split(".");
    const outraOrg = Buffer.from(Buffer.from(carga!, "base64url").toString("utf8").replace("org-1", "org-2"), "utf8").toString("base64url");
    expect(verificarEstado(`${outraOrg}.${assinatura}`, { segredo: SEGREDO, agora: AGORA })).toBeNull();
    expect(verificarEstado(token, { segredo: "um-outro-segredo-interno", agora: AGORA })).toBeNull();
    expect(verificarEstado(token, { segredo: SEGREDO, agora: new Date(AGORA.getTime() + VALIDADE_DO_ESTADO_MS + 1) })).toBeNull();
    expect(verificarEstado(null, { segredo: SEGREDO, agora: AGORA })).toBeNull();
    expect(verificarEstado("lixo", { segredo: SEGREDO, agora: AGORA })).toBeNull();
  });

  it("sem INTERNAL_SECRET utilizável, nem emite nem verifica — lança", () => {
    expect(() => emitirEstado(quem, { segredo: "curto", agora: AGORA })).toThrow(/INTERNAL_SECRET/);
  });
});

describe("as chamadas à Meta", () => {
  function comResposta(corpo: unknown, status = 200) {
    const f = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(corpo), { status }));
    vi.stubGlobal("fetch", f);
    return f;
  }

  it("a autorização pede só as permissões de comentário e direct, e leva o state", () => {
    const url = new URL(api.urlDeAutorizacao({ appId: "123456", redirectUri: "https://app.exemplo.test/volta", state: "abc.def" }));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments");
    expect(url.searchParams.get("state")).toBe("abc.def");
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("⭐ a resposta PRIVADA vai ancorada no comentário, com o token no cabeçalho", async () => {
    const f = comResposta({ message_id: "m1" });
    await api.enviarRespostaPrivada("token-da-conta", "comentario-1", "Aqui está o link", f as never);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.instagram.com/v22.0/me/messages");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer token-da-conta");
    expect(JSON.parse(String(init!.body))).toEqual({ recipient: { comment_id: "comentario-1" }, message: { text: "Aqui está o link" } });
  });

  it("a resposta pública vai para as respostas do comentário, só com texto", async () => {
    const f = comResposta({ id: "r1" });
    await api.responderComentario("t", "comentario 1", "Te mandei no direct!", f as never);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.instagram.com/v22.0/comentario%201/replies");
    expect(JSON.parse(String(init!.body))).toEqual({ message: "Te mandei no direct!" });
  });

  it("recusa da Meta vira erro com o status e a MENSAGEM dela — é o que aparece no registro", async () => {
    const f = comResposta({ error: { message: "This user cannot receive messages" } }, 400);
    await expect(api.enviarRespostaPrivada("t", "c", "x", f as never)).rejects.toMatchObject({
      status: 400,
      detalhe: "This user cannot receive messages",
      onde: "resposta_privada",
    });
  });

  it("conta pessoal não é conta: lerConta devolve null; profissional devolve os dois ids", async () => {
    expect(await api.lerConta("t", comResposta({ id: "1", user_id: "2", username: "x", account_type: "PERSONAL" }) as never)).toBeNull();
    expect(await api.lerConta("t", comResposta({ id: "1784", user_id: 9990, username: "loja", account_type: "BUSINESS" }) as never)).toEqual({
      id: "1784",
      userId: "9990",
      username: "loja",
      name: null,
      profilePictureUrl: null,
    });
  });

  it("assinar os avisos sem a Meta confirmar é erro — conexão que parece ligada e não responde é o pior desfecho", async () => {
    await expect(api.assinarAvisos("t", comResposta({ success: false }) as never)).rejects.toMatchObject({ onde: "assinar_avisos" });
    await expect(api.assinarAvisos("t", comResposta({ success: true }) as never)).resolves.toBeUndefined();
  });

  it("publicações: a capa do vídeo vem da miniatura; a da imagem, da própria mídia", async () => {
    const f = comResposta({
      data: [
        { id: "1", media_type: "IMAGE", media_url: "https://cdn/img.jpg", caption: "Foto" },
        { id: "2", media_type: "VIDEO", media_url: "https://cdn/video.mp4", thumbnail_url: "https://cdn/capa.jpg" },
      ],
    });
    const lista = await api.listarPublicacoes("t", f as never);
    expect(lista.map((p) => p.thumbnailUrl)).toEqual(["https://cdn/img.jpg", "https://cdn/capa.jpg"]);
  });
});
