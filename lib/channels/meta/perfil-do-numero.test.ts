import { describe, expect, it, vi } from "vitest";

import { pinDoNumero } from "./cadastro-incorporado";
import {
  conferirCodigo,
  enviarFoto,
  lerPerfilDoNumero,
  motivoLegivel,
  pedirCodigo,
  pedirNovoNome,
  perfilComercialSchema,
  registrarNumero,
  salvarPerfilComercial,
} from "./perfil-do-numero";

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

function graph(respostas: Response[]) {
  const chamadas: { aresta: string; corpo: unknown; cabecalhos: Record<string, string> }[] = [];
  const buscar = vi.fn(async (entrada: string | URL | Request, init?: RequestInit) => {
    chamadas.push({
      aresta: new URL(String(entrada)).pathname.split("/").slice(2).join("/"),
      corpo: init?.body,
      cabecalhos: (init?.headers as Record<string, string> | undefined) ?? {},
    });
    const proxima = respostas.shift();
    if (!proxima) throw new Error("chamada a mais");
    return proxima;
  }) as unknown as typeof fetch;
  return { buscar, chamadas };
}

const base = { phoneNumberId: "num1", token: "tok-secreto" };
const form = (c: unknown) => c as URLSearchParams;

describe("perfil do número oficial na Meta", () => {
  it("lê o estado e o perfil, e não devolve o token", async () => {
    const { buscar, chamadas } = graph([
      resposta(200, {
        display_phone_number: "+55 69 8105-0205", verified_name: "Esmeralda Cigana", name_status: "DECLINED",
        new_display_name: "Esmeralda", new_name_status: "PENDING_REVIEW", status: "DISCONNECTED",
        code_verification_status: "EXPIRED", quality_rating: "GREEN",
      }),
      resposta(200, { data: [{ about: "Leituras", websites: ["https://a.com"], vertical: "ENTERTAIN", profile_picture_url: "https://x/f.jpg" }] }),
    ]);

    const r = await lerPerfilDoNumero(base, buscar);

    expect(r.ok && r.valor.estado).toEqual({
      telefone: "+55 69 8105-0205", nome: "Esmeralda Cigana", situacaoDoNome: "DECLINED", nomePedido: "Esmeralda",
      situacaoDoNomePedido: "PENDING_REVIEW", conexao: "DISCONNECTED", verificacao: "EXPIRED", qualidade: "GREEN",
    });
    expect(r.ok && r.valor.perfil).toMatchObject({ about: "Leituras", websites: ["https://a.com"], vertical: "ENTERTAIN", fotoUrl: "https://x/f.jpg" });
    expect(chamadas[1]?.aresta).toBe("num1/whatsapp_business_profile");
    expect(JSON.stringify(r)).not.toContain("tok-secreto");
  });

  it("salva o perfil como escrita, com a lista de sites em JSON", async () => {
    const { buscar, chamadas } = graph([resposta(200, { success: true })]);

    const r = await salvarPerfilComercial({ ...base, perfil: { about: "Oi", websites: ["https://a.com"] } }, buscar);

    expect(r.ok).toBe(true);
    const corpo = form(chamadas[0]?.corpo);
    expect(chamadas[0]?.aresta).toBe("num1/whatsapp_business_profile");
    expect(corpo.get("messaging_product")).toBe("whatsapp");
    expect(corpo.get("websites")).toBe('["https://a.com"]');
    expect(corpo.has("method")).toBe(false);
  });

  it("recusa campo fora do limite da Meta antes de chamar", () => {
    expect(perfilComercialSchema.safeParse({ about: "x".repeat(140) }).success).toBe(false);
    expect(perfilComercialSchema.safeParse({ websites: ["https://a", "https://b", "https://c"] }).success).toBe(false);
    expect(perfilComercialSchema.safeParse({ websites: ["javascript:alert(1)"] }).success).toBe(false);
    expect(perfilComercialSchema.safeParse({ vertical: "QUALQUER" }).success).toBe(false);
  });

  it("pede o nome novo no próprio número", async () => {
    const { buscar, chamadas } = graph([resposta(200, { success: true })]);
    expect((await pedirNovoNome({ ...base, nome: "Esmeralda" }, buscar)).ok).toBe(true);
    expect(chamadas[0]?.aresta).toBe("num1");
    expect(form(chamadas[0]?.corpo).get("new_display_name")).toBe("Esmeralda");
  });

  it("verificação por SMS: pede o código e confere sem deixar o código no motivo", async () => {
    const { buscar, chamadas } = graph([resposta(200, { success: true }), resposta(400, { error: { message: "Invalid code" } })]);

    expect((await pedirCodigo(base, buscar)).ok).toBe(true);
    expect(form(chamadas[0]?.corpo).get("code_method")).toBe("SMS");
    const r = await conferirCodigo({ ...base, codigo: "654321" }, buscar);
    expect(chamadas[1]?.aresta).toBe("num1/verify_code");
    expect(r).toEqual({ ok: false, motivo: "Invalid code" });
    expect(JSON.stringify(r)).not.toContain("654321");
  });

  it("registrar sempre registra, com o PIN derivado", async () => {
    const { buscar, chamadas } = graph([resposta(200, { success: true })]);
    expect((await registrarNumero({ ...base, segredoDoPin: "s" }, buscar)).ok).toBe(true);
    expect(form(chamadas[0]?.corpo).get("pin")).toBe(pinDoNumero("num1", "s"));
  });

  it("⭐ o 133006 vira instrução de verificar por SMS", () => {
    expect(motivoLegivel("Phone number needs to be verified before registering")).toContain("Enviar código");
  });

  it("foto: descobre o app, abre o envio, sobe o arquivo cru e devolve o handle", async () => {
    const { buscar, chamadas } = graph([
      resposta(200, { id: "app9" }),
      resposta(200, { id: "upload:abc" }),
      resposta(200, { h: "handle-1" }),
    ]);
    const bytes = new Uint8Array([1, 2, 3]);

    const r = await enviarFoto({ token: "tok", appId: null, bytes, tipo: "image/png" }, buscar);

    expect(r).toEqual({ ok: true, valor: "handle-1" });
    expect(chamadas[1]?.aresta).toBe("app9/uploads");
    expect(form(chamadas[1]?.corpo).get("file_length")).toBe("3");
    expect(chamadas[2]?.aresta).toBe("upload:abc");
    expect(chamadas[2]?.cabecalhos.file_offset).toBe("0");
    expect(chamadas[2]?.corpo).toBe(bytes);
  });

  it("foto acima de 5 MB nem chega à Meta", async () => {
    const { buscar } = graph([]);
    const r = await enviarFoto({ token: "tok", appId: "a", bytes: new Uint8Array(5 * 1024 * 1024 + 1), tipo: "image/jpeg" }, buscar);
    expect(r.ok).toBe(false);
  });
});
