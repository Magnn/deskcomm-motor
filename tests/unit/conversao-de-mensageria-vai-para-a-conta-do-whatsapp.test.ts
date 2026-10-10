/**
 * A CONVERSÃO DE UMA VENDA DO WHATSAPP VAI PARA O CONJUNTO DE DADOS DA CONTA DO WHATSAPP.
 *
 * Medido em 10/10/2026, no primeiro envio real: a plataforma recusou por faltar a conta do WhatsApp
 * Business em `user_data` (subcódigo 2804116) e, com a conta, por o conjunto de dados ser o do pixel
 * do site (2804132). O destino certo é o conjunto de dados da própria conta, com o token do canal.
 */
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { conjuntoDeDadosDaConta, idDoConjuntoDeDados } from "@/lib/channels/meta/conjunto-de-dados-da-conta";
import { transporteMeta } from "@/lib/plataformas-de-anuncio/meta/conversions";

afterEach(() => vi.restoreAllMocks());

describe("o id do conjunto de dados, nos dois formatos da resposta", () => {
  it("criação devolve `{ id }`; leitura devolve `{ data: [{ id }] }`", () => {
    expect(idDoConjuntoDeDados({ id: "2958536614503663" })).toBe("2958536614503663");
    expect(idDoConjuntoDeDados({ data: [{ id: "111" }, { id: "222" }] })).toBe("111");
  });

  it("conta sem conjunto de dados (`data: []`) e resposta torta: null — é o que dispara a criação", () => {
    expect(idDoConjuntoDeDados({ data: [] })).toBeNull();
    expect(idDoConjuntoDeDados(null)).toBeNull();
    expect(idDoConjuntoDeDados({ id: "  " })).toBeNull();
  });
});

describe("ler o conjunto de dados da conta, e criar quando não há", () => {
  it("conta que já tem: devolve o existente, sem criar", async () => {
    const rede = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "111" }] })));
    await expect(conjuntoDeDadosDaConta("conta", "TOKEN", rede as unknown as typeof fetch)).resolves.toEqual({ id: "111" });
    expect(rede).toHaveBeenCalledTimes(1);
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/conta/dataset");
    expect(url).not.toContain("TOKEN");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
  });

  it("⭐ conta sem nenhum: cria, e devolve o id criado", async () => {
    const respostas = [new Response(JSON.stringify({ data: [] })), new Response(JSON.stringify({ id: "2958536614503663" }))];
    const rede = vi.fn(async () => respostas.shift()!);
    await expect(conjuntoDeDadosDaConta("conta", "TOKEN", rede as unknown as typeof fetch)).resolves.toEqual({ id: "2958536614503663" });
    expect((rede.mock.calls[1] as unknown as [string, RequestInit])[1].method).toBe("POST");
  });

  it("sem permissão para ler: NÃO tenta criar às cegas — devolve o erro", async () => {
    const rede = vi.fn(async () => new Response("{}", { status: 403 }));
    await expect(conjuntoDeDadosDaConta("conta", "TOKEN", rede as unknown as typeof fetch)).resolves.toEqual({ erro: "leitura do conjunto de dados: 403" });
    expect(rede).toHaveBeenCalledTimes(1);
  });

  it("rede fora: erro, nunca exceção", async () => {
    const rede = vi.fn(async () => Promise.reject(new Error("fetch failed")));
    await expect(conjuntoDeDadosDaConta("conta", "TOKEN", rede as unknown as typeof fetch)).resolves.toEqual({ erro: "fetch failed" });
  });
});

describe("o que vai no fio", () => {
  const conversao = {
    organizationId: "org",
    leadId: "lead-1",
    evento: "Purchase" as const,
    eventoId: "lead-1:Purchase",
    ocorridoEm: new Date(),
    cliqueDeOrigem: "clique-abc",
    telefone: "5511999990000",
    valorCentavos: 13_000,
    moeda: "BRL",
  };
  const credencial = { datasetId: "2958536614503663", accessToken: "TOKEN", testEventCode: null };

  it("⭐ `user_data` leva a conta do WhatsApp Business junto do clique", async () => {
    const rede = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ events_received: 1 })));
    const r = await transporteMeta.enviar(credencial, { ...conversao, contaDoWhatsApp: "1425257569195450" });
    expect(r.tipo).toBe("ok");
    const [url, init] = rede.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/2958536614503663/events");
    expect(url).not.toContain("TOKEN");
    const evento = JSON.parse(String(init.body)).data[0];
    expect(evento.action_source).toBe("business_messaging");
    expect(evento.user_data).toMatchObject({ ctwa_clid: "clique-abc", whatsapp_business_account_id: "1425257569195450" });
    expect(evento.custom_data).toEqual({ value: 130, currency: "BRL" });
  });

  it("⭐ a recusa traz o motivo que a plataforma dá a quem opera, não só 'Invalid parameter'", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ error: { code: 100, message: "Invalid parameter", error_user_msg: "o conjunto de dados não tem uma conta do WhatsApp Business vinculada" } }),
          { status: 400 },
        ),
    );
    const r = await transporteMeta.enviar(credencial, { ...conversao, contaDoWhatsApp: "1" });
    expect(r.tipo).not.toBe("ok");
    expect("detalhe" in r ? r.detalhe : "").toContain("não tem uma conta do WhatsApp Business vinculada");
  });
});

describe("a fiação no envio", () => {
  const handler = readFileSync("lib/conversoes/envio.handler.ts", "utf8");

  it("⭐ para a Meta, o destino (conjunto de dados e token) é o do CANAL, e a tela segue como interruptor", () => {
    const trecho = handler.slice(handler.indexOf("const credencial = await lerCredencial("));
    // A tela decide primeiro (ligada/desligada)…
    expect(trecho.indexOf("lerCredencial(")).toBeLessThan(trecho.indexOf("lerDestinoDeMensageria("));
    // …e o envio sai com o destino do canal.
    expect(trecho).toContain("datasetId: destino.destino.datasetId");
    expect(trecho).toContain("accessToken: destino.destino.accessToken");
    expect(trecho).toContain("transporte.enviar(credencialDoEnvio, conversao)");
  });

  it("conversa sem canal oficial vira pendência com nome próprio, não recusa da plataforma", () => {
    expect(handler).toContain('await registra("skipped", destino.motivo, destino.detalhe)');
    const estado = readFileSync("lib/conversoes/estado-da-conexao.ts", "utf8");
    for (const motivo of ["sem_conta_do_whatsapp", "canal_sem_credencial", "conjunto_de_dados_indisponivel"]) {
      expect(estado).toContain(`${motivo}:`);
    }
  });
});
