import { describe, expect, it } from "vitest";

import { ehHostBloqueadoPorSsrf, parseCurl } from "./api-call";

describe("parseCurl", () => {
  it("lê o formato simples de 'Copy as cURL' do navegador", () => {
    const r = parseCurl(
      `curl 'https://api.exemplo.com/webhook' -H 'Content-Type: application/json' -H 'Authorization: Bearer xyz' --data-raw '{"lead":"ok"}'`,
    );
    expect(r).toEqual({
      method: "POST",
      url: "https://api.exemplo.com/webhook",
      headers: [
        { key: "Content-Type", value: "application/json" },
        { key: "Authorization", value: "Bearer xyz" },
      ],
      body: '{"lead":"ok"}',
    });
  });

  it("-X explícito vence o método implícito do -d", () => {
    const r = parseCurl(`curl -X PUT https://x.com/y -d 'corpo'`);
    expect(r?.method).toBe("PUT");
  });

  it("sem body e sem -X, o método é GET", () => {
    const r = parseCurl(`curl https://x.com/y`);
    expect(r?.method).toBe("GET");
    expect(r?.body).toBeUndefined();
  });

  it("sem body mas COM -X, respeita o método pedido mesmo sendo incomum (DELETE)", () => {
    const r = parseCurl(`curl -X DELETE https://x.com/y/123`);
    expect(r?.method).toBe("DELETE");
  });

  it("--header (forma longa) e aspas duplas", () => {
    const r = parseCurl(`curl --header "X-Token: abc" --request POST "https://x.com/y"`);
    expect(r).toEqual({ method: "POST", url: "https://x.com/y", headers: [{ key: "X-Token", value: "abc" }] });
  });

  it("continuação de linha (barra invertida) do cURL colado do DevTools", () => {
    const r = parseCurl(`curl 'https://x.com/y' \\\n  -H 'A: 1' \\\n  -d 'ok'`);
    expect(r?.url).toBe("https://x.com/y");
    expect(r?.headers).toEqual([{ key: "A", value: "1" }]);
    expect(r?.body).toBe("ok");
  });

  it("múltiplos -d concatenam com &, como o cURL de verdade", () => {
    const r = parseCurl(`curl https://x.com/y -d 'a=1' -d 'b=2'`);
    expect(r?.body).toBe("a=1&b=2");
  });

  it("ignora flags conhecidas sem argumento (-s, -L) sem quebrar o resto", () => {
    const r = parseCurl(`curl -sL -X GET https://x.com/y`);
    expect(r).toEqual({ method: "GET", url: "https://x.com/y", headers: [] });
  });

  it("ignora flags conhecidas COM argumento (-u) sem derivar informação delas", () => {
    const r = parseCurl(`curl -u usuario:senha https://x.com/y`);
    expect(r?.url).toBe("https://x.com/y");
    expect(r?.headers).toEqual([]);
  });

  it("sem 'curl' na frente também funciona (só os argumentos)", () => {
    const r = parseCurl(`-X POST https://x.com/y`);
    expect(r?.method).toBe("POST");
    expect(r?.url).toBe("https://x.com/y");
  });

  it("devolve null sem URL nenhuma — nunca inventa uma", () => {
    expect(parseCurl(`curl -X POST -H "A: 1"`)).toBeNull();
  });

  it("devolve null para string vazia", () => {
    expect(parseCurl("")).toBeNull();
    expect(parseCurl("   ")).toBeNull();
  });

  it("devolve null quando a URL não é http(s)", () => {
    expect(parseCurl(`curl ftp://x.com/y`)).toBeNull();
  });
});

describe("ehHostBloqueadoPorSsrf", () => {
  // Wrapper síncrono de `assertSafeOutboundUrl` (lib/automation/outbound-url.ts,
  // já provado em `outbound-url.test.ts` e em produção pela ação `call_webhook`
  // — DIRC: reaproveita em vez de reimplementar a régua de host privado). Este
  // bloco só prova que o wrapper DELEGA de verdade (booleano em vez de lançar),
  // não repete a régua inteira.
  it.each([
    "http://localhost:3000/x",
    "http://127.0.0.1/x",
    "http://10.0.0.5/x",
    "http://172.16.0.1/x",
    "http://192.168.1.1/x",
    "http://169.254.169.254/latest/meta-data", // metadados de nuvem — o alvo clássico de SSRF
    "http://[::1]/x",
  ])("bloqueia %s", (url) => {
    expect(ehHostBloqueadoPorSsrf(url)).toBe(true);
  });

  it.each(["https://api.exemplo.com/webhook", "https://8.8.8.8/x"])("aprova %s", (url) => {
    expect(ehHostBloqueadoPorSsrf(url)).toBe(false);
  });

  it("URL ilegível não é aprovada por omissão", () => {
    expect(ehHostBloqueadoPorSsrf("não é uma url")).toBe(true);
  });
});
