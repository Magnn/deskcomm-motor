import { describe, expect, it, vi } from "vitest";

import {
  credencialDoCadastroIncorporado,
  garantirNumeroRegistrado,
  pinDoNumero,
} from "./cadastro-incorporado";

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

/** Cada chamada é registrada como `aresta` + os parâmetros do CORPO + o cabeçalho. */
function graph(respostas: Response[]) {
  const chamadas: { url: string; aresta: string; corpo: URLSearchParams; autorizacao: string | null }[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    chamadas.push({
      url,
      aresta: new URL(url).pathname.split("/").slice(2).join("/"),
      corpo: init?.body as URLSearchParams,
      autorizacao: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
    });
    const proxima = respostas.shift();
    if (!proxima) throw new Error(`chamada a mais: ${url}`);
    return proxima;
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const app = { appId: "app1", appSecret: "segredo-do-app", configId: "cfg1" };
const naoExpira = { data: { expires_at: 0, granular_scopes: [{ scope: "whatsapp_business_management", target_ids: ["waba1"] }] } };

describe("o código da janela do Facebook vira a credencial do canal", () => {
  it("com a conta e o número que a janela avisou, não lista nada: troca, inspeciona e devolve", async () => {
    const { buscar, chamadas } = graph([resposta(200, { access_token: "tok" }), resposta(200, naoExpira)]);

    const r = await credencialDoCadastroIncorporado({ app, code: "cod", phoneNumberId: "num9", wabaId: "waba9" }, buscar);

    expect(r).toEqual({ ok: true, token: "tok", phoneNumberId: "num9", wabaId: "waba9" });
    expect(chamadas.map((c) => c.aresta)).toEqual(["oauth/access_token", "debug_token"]);
    // Código nascido no SDK é trocado SEM endereço de volta.
    expect(chamadas[0]?.corpo.has("redirect_uri")).toBe(false);
  });

  it("segredo, código e token vão no corpo — nunca na URL", async () => {
    const { buscar, chamadas } = graph([resposta(200, { access_token: "ACESSO-1" }), resposta(200, naoExpira)]);

    await credencialDoCadastroIncorporado({ app, code: "CODIGO-1", phoneNumberId: "num9", wabaId: "waba9" }, buscar);

    for (const c of chamadas) {
      expect(c.url).not.toContain("segredo-do-app");
      expect(c.url).not.toContain("CODIGO-1");
      expect(c.url).not.toContain("ACESSO-1");
    }
    expect(chamadas[0]?.corpo.get("client_secret")).toBe("segredo-do-app");
    expect(chamadas[0]?.corpo.get("code")).toBe("CODIGO-1");
    expect(chamadas[1]?.corpo.get("input_token")).toBe("ACESSO-1");
  });

  it("sem o aviso da janela, lê a conta do token e conecta o único número dela", async () => {
    const { buscar, chamadas } = graph([
      resposta(200, { access_token: "tok" }),
      resposta(200, naoExpira),
      resposta(200, { data: [{ id: "num1" }] }),
    ]);

    const r = await credencialDoCadastroIncorporado({ app, code: "cod" }, buscar);

    expect(r).toEqual({ ok: true, token: "tok", phoneNumberId: "num1", wabaId: "waba1" });
    expect(chamadas[2]?.aresta).toBe("waba1/phone_numbers");
    expect(chamadas[2]?.autorizacao).toBe("Bearer tok");
  });

  it("sem o aviso e com mais de um número ao alcance, não adivinha", async () => {
    const { buscar } = graph([
      resposta(200, { access_token: "tok" }),
      resposta(200, naoExpira),
      resposta(200, { data: [{ id: "num1" }, { id: "num2" }] }),
    ]);

    expect(await credencialDoCadastroIncorporado({ app, code: "cod" }, buscar)).toEqual({
      ok: false,
      falha: "varios_numeros",
      detalhe: null,
    });
  });

  it("sem o aviso e sem número nenhum ao alcance, diz que nenhum foi liberado", async () => {
    const { buscar } = graph([
      resposta(200, { access_token: "tok" }),
      resposta(200, { data: { expires_at: 0, granular_scopes: [] } }),
    ]);

    expect(await credencialDoCadastroIncorporado({ app, code: "cod" }, buscar)).toMatchObject({
      ok: false,
      falha: "nenhum_numero",
    });
  });

  it("⭐ token que vence é recusado, mesmo com conta e número em mãos", async () => {
    const { buscar } = graph([
      resposta(200, { access_token: "tok" }),
      resposta(200, { data: { expires_at: 1_800_000_000 } }),
    ]);

    expect(
      await credencialDoCadastroIncorporado({ app, code: "cod", phoneNumberId: "num9", wabaId: "waba9" }, buscar),
    ).toEqual({ ok: false, falha: "token_expira", detalhe: null });
  });

  it("inspeção que falha não derruba a conexão quando a janela avisou a conta e o número", async () => {
    const { buscar } = graph([resposta(200, { access_token: "tok" }), resposta(400, { error: { message: "não deu" } })]);

    expect(
      await credencialDoCadastroIncorporado({ app, code: "cod", phoneNumberId: "num9", wabaId: "waba9" }, buscar),
    ).toMatchObject({ ok: true, token: "tok" });
  });

  it("código recusado devolve o motivo que a Meta deu", async () => {
    const { buscar } = graph([resposta(400, { error: { message: "This authorization code has expired." } })]);

    expect(await credencialDoCadastroIncorporado({ app, code: "cod" }, buscar)).toEqual({
      ok: false,
      falha: "troca_do_codigo",
      detalhe: "This authorization code has expired.",
    });
  });
});

describe("o registro do número na Cloud API", () => {
  const p = { phoneNumberId: "num1", token: "tok", segredoDoPin: "segredo-da-instalacao-longo" };

  it("o PIN tem seis dígitos e é sempre o mesmo para o mesmo número", () => {
    const pin = pinDoNumero("num1", p.segredoDoPin);
    expect(pin).toMatch(/^\d{6}$/);
    expect(pinDoNumero("num1", p.segredoDoPin)).toBe(pin);
    expect(pinDoNumero("num2", p.segredoDoPin)).not.toBe(pin);
  });

  it("número que já está na Cloud API fica como está — não troca o PIN de quem já tem", async () => {
    const { buscar, chamadas } = graph([resposta(200, { platform_type: "CLOUD_API" })]);

    expect(await garantirNumeroRegistrado(p, buscar)).toEqual({ ok: true, registrou: false, noAplicativo: false });
    expect(chamadas).toHaveLength(1);
  });

  it("número novo é registrado com o PIN derivado", async () => {
    const { buscar, chamadas } = graph([resposta(200, { platform_type: "NOT_APPLICABLE" }), resposta(200, { success: true })]);

    expect(await garantirNumeroRegistrado(p, buscar)).toEqual({ ok: true, registrou: true, noAplicativo: false });
    expect(chamadas[1]?.aresta).toBe("num1/register");
    expect(chamadas[1]?.corpo.get("messaging_product")).toBe("whatsapp");
    expect(chamadas[1]?.corpo.get("pin")).toBe(pinDoNumero("num1", p.segredoDoPin));
    // Registro é escrita: não pode sair como leitura disfarçada.
    expect(chamadas[1]?.corpo.has("method")).toBe(false);
  });

  it("⭐ coexistência: número que continua no aplicativo do celular NÃO é registrado", async () => {
    const { buscar, chamadas } = graph([resposta(200, { platform_type: "NOT_APPLICABLE", is_on_biz_app: true })]);

    expect(await garantirNumeroRegistrado(p, buscar)).toEqual({ ok: true, registrou: false, noAplicativo: true });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.corpo.get("fields")).toContain("is_on_biz_app");
  });

  it("versão da Graph que não conhece o campo do aplicativo: lê de novo sem ele e segue", async () => {
    const { buscar, chamadas } = graph([
      resposta(400, { error: { message: "(#100) Tried accessing nonexisting field (is_on_biz_app)" } }),
      resposta(200, { platform_type: "CLOUD_API" }),
    ]);

    expect(await garantirNumeroRegistrado(p, buscar)).toEqual({ ok: true, registrou: false, noAplicativo: false });
    expect(chamadas[1]?.corpo.get("fields")).toBe("platform_type");
  });

  it("registro recusado devolve o detalhe da Meta", async () => {
    const { buscar } = graph([
      resposta(200, { platform_type: "NOT_APPLICABLE" }),
      resposta(400, { error: { message: "Invalid parameter", error_data: { details: "Two step verification PIN mismatch" } } }),
    ]);

    expect(await garantirNumeroRegistrado(p, buscar)).toEqual({ ok: false, motivo: "Two step verification PIN mismatch" });
  });
});
