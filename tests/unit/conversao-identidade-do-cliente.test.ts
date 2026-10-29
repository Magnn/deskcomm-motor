/**
 * A identidade do cliente no evento de conversão.
 *
 * Medido em 29/10/2026: a Compra ia à Meta só com telefone, país, clique, IP e navegador (nota 7,2/10), e
 * nenhum dos 581 contatos com evento tinha nome ou nascimento gravados. A resposta "nome completo e data de
 * nascimento" ficava como texto num campo do lead. Estes testes travam a leitura dessa resposta e os campos
 * que passam a ir no `user_data`.
 */
import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { identidadeDaResposta, montarIdentidade, partesDoNome } from "@/lib/conversoes/identidade-do-cliente";
import { transporteMeta } from "@/lib/plataformas-de-anuncio/meta/conversions";
import type { ConversaoOffline } from "@/lib/plataformas-de-anuncio/types";

const HOJE = new Date("2026-10-29T12:00:00Z");
const h = (v: string) => createHash("sha256").update(v).digest("hex");

describe("identidadeDaResposta", () => {
  it("⭐ 'Nome Sobrenome dd/mm/aa' vira nome e nascimento", () => {
    expect(identidadeDaResposta("Ana Maria Souza 29/04/72", HOJE)).toEqual({ nome: "Ana Maria Souza", nascimento: "1972-04-29" });
  });

  it("aceita ponto, hífen e ano com 4 dígitos", () => {
    expect(identidadeDaResposta("Joana Lima - 01.07.1985", HOJE)).toEqual({ nome: "Joana Lima", nascimento: "1985-07-01" });
    expect(identidadeDaResposta("Bia Reis 14-12-1976", HOJE).nascimento).toBe("1976-12-14");
  });

  it("ano de 2 dígitos à frente do ano corrente é do século passado", () => {
    expect(identidadeDaResposta("Rui 03/05/99", HOJE).nascimento).toBe("1999-05-03");
    expect(identidadeDaResposta("Rui 03/05/05", HOJE).nascimento).toBe("2005-05-03");
  });

  it("data que não existe ou idade fora de 10–110 anos: sem nascimento", () => {
    expect(identidadeDaResposta("Ana 31/02/1990", HOJE).nascimento).toBeNull();
    expect(identidadeDaResposta("Ana 01/01/2020", HOJE).nascimento).toBeNull();
    expect(identidadeDaResposta("Ana 01/01/1890", HOJE).nascimento).toBeNull();
  });

  it("sem data: nada (texto livre não vira nome)", () => {
    expect(identidadeDaResposta("quero saber se ele volta", HOJE)).toEqual({ nome: null, nascimento: null });
    expect(identidadeDaResposta(undefined, HOJE)).toEqual({ nome: null, nascimento: null });
  });
});

describe("partesDoNome", () => {
  it("primeiro nome e último sobrenome, minúsculas, só letras", () => {
    expect(partesDoNome("Ana Maria Souza")).toEqual({ primeiro: "ana", sobrenome: "souza" });
    expect(partesDoNome("Filhaa Do Donoo😍🥰")).toEqual({ primeiro: "filhaa", sobrenome: "donoo" });
    expect(partesDoNome("Ariane")).toEqual({ primeiro: "ariane", sobrenome: null });
    expect(partesDoNome("😍")).toEqual({ primeiro: null, sobrenome: null });
  });
});

describe("montarIdentidade", () => {
  const contato = { id: "ct-1", email: null, name: null, display_name: null, birthdate: null };

  it("⭐ contato sem nada gravado: nome e nascimento saem da resposta no lead", () => {
    expect(montarIdentidade({ ...contato, display_name: "Ari" }, ["sim", "Ariane Costa Lima 12/03/1985"], HOJE)).toEqual({
      idExterno: "ct-1",
      email: null,
      primeiroNome: "ariane",
      sobrenome: "lima",
      nascimento: "1985-03-12",
    });
  });

  it("o gravado no contato vale mais que a resposta", () => {
    const id = montarIdentidade({ ...contato, name: "Maria Silva", birthdate: "1990-01-02", email: " Maria@Ex.com " }, ["Outra Pessoa 05/05/1980"], HOJE);
    expect(id).toMatchObject({ email: "maria@ex.com", primeiroNome: "maria", sobrenome: "silva", nascimento: "1990-01-02" });
  });

  it("só o nome do WhatsApp: vira só o primeiro nome", () => {
    expect(montarIdentidade({ ...contato, display_name: "Paula Elizethe" }, [], HOJE)).toMatchObject({ primeiroNome: "paula", sobrenome: null });
  });

  it("e-mail inválido não vai", () => {
    expect(montarIdentidade({ ...contato, email: "sem-arroba" }, [], HOJE).email).toBeNull();
  });
});

describe("envio à Meta com a identidade", () => {
  afterEach(() => vi.unstubAllGlobals());

  function conversao(over: Partial<ConversaoOffline> = {}): ConversaoOffline {
    return {
      organizationId: "org",
      leadId: "lead",
      evento: "Purchase",
      eventoId: "lead:Purchase",
      ocorridoEm: new Date(),
      cliqueDeOrigem: "fbclid-1",
      telefone: "5545999999999",
      pixelDoSite: true,
      valorCentavos: 13000,
      moeda: "BRL",
      ...over,
    };
  }

  async function userDataEnviado(c: ConversaoOffline): Promise<Record<string, unknown>> {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await transporteMeta.enviar({ datasetId: "123", accessToken: "tok", testEventCode: null } as never, c);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const corpo = JSON.parse(String(init.body)) as { data: Array<{ user_data: Record<string, unknown> }> };
    return corpo.data[0]!.user_data;
  }

  it("⭐ e-mail, nome, sobrenome, nascimento e id externo vão com hash", async () => {
    const ud = await userDataEnviado(
      conversao({ identidade: { idExterno: "ct-1", email: "ana@ex.com", primeiroNome: "ana", sobrenome: "souza", nascimento: "1972-04-29" } }),
    );
    expect(ud).toMatchObject({
      external_id: [h("ct-1")],
      em: [h("ana@ex.com")],
      fn: [h("ana")],
      ln: [h("souza")],
      db: [h("19720429")],
      ph: [h("5545999999999")],
      country: [h("br")],
    });
  });

  it("sem identidade: o envio continua como antes (telefone e país)", async () => {
    const ud = await userDataEnviado(conversao());
    expect(ud).toEqual({ ph: [h("5545999999999")], country: [h("br")] });
  });

  it("mensageria também leva o país e a identidade", async () => {
    const ud = await userDataEnviado(
      conversao({ pixelDoSite: false, contaDoWhatsApp: "waba-1", identidade: { idExterno: "ct-1" } }),
    );
    expect(ud).toMatchObject({ ctwa_clid: "fbclid-1", country: [h("br")], external_id: [h("ct-1")] });
  });
});
