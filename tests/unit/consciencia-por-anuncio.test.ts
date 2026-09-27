import { describe, expect, it, vi } from "vitest";

import { adBriefInputSchema, resolverConscienciaDoAnuncio } from "@/lib/consciencia/ad-briefs";

/**
 * A resolução de qual consciência vale para um contato: brief por `ad_id` exato > brief por trecho
 * do título > `null` (quem chama cai para o default do agente). O que estes testes prendem:
 *   1. `ad_id` exato vence sempre que existir uma linha;
 *   2. sem `ad_id` batendo, cai para `titulo_contem` por SUBSTRING (case-insensitive);
 *   3. mais de uma linha batendo (por qualquer caminho) é "não resolveu" — nunca escolhe às cegas;
 *   4. sem anúncio, ou anúncio sem `adId` nem `titulo`, é `null` sem consultar o banco;
 *   5. o schema de entrada exige rótulo e pelo menos um dos dois campos de casamento.
 */

const ORG = "org-1";
const AGENTE = "agente-1";

/** Fake mínimo do `pg.Pool` — só o que `resolverConscienciaDoAnuncio` usa (`db.query(...).rows`). */
function fakeDb(respostas: Array<Array<Record<string, unknown>>>) {
  let i = 0;
  return {
    query: vi.fn(async () => ({ rows: respostas[i++] ?? [] })),
  } as unknown as Parameters<typeof resolverConscienciaDoAnuncio>[0];
}

describe("resolverConscienciaDoAnuncio", () => {
  it("sem anúncio: null, sem consultar o banco", async () => {
    const db = fakeDb([]);
    const r = await resolverConscienciaDoAnuncio(db, { organizationId: ORG, agentId: AGENTE, anuncio: null });
    expect(r).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("anúncio sem adId nem título: null, sem consultar o banco", async () => {
    const db = fakeDb([]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: null, titulo: null },
    });
    expect(r).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("ad_id exato bate: devolve a consciência daquela linha, enabled sempre true", async () => {
    const db = fakeDb([[{ nivel: "conhece_a_oferta", desejo_ou_dor: "fechar rápido", medo_oculto: null, promessa: null }]]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: "12345", titulo: null },
    });
    expect(r).toEqual({ enabled: true, nivel: "conhece_a_oferta", desejo_ou_dor: "fechar rápido" });
  });

  it("sem bater por ad_id, cai para título por substring", async () => {
    const db = fakeDb([
      [], // consulta por ad_id: nada
      [{ nivel: "sabe_do_problema", desejo_ou_dor: null, medo_oculto: "achar que não tem jeito", promessa: null }],
    ]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: "sem-match", titulo: "Recomece com leveza" },
    });
    expect(r).toEqual({ enabled: true, nivel: "sabe_do_problema", medo_oculto: "achar que não tem jeito" });
  });

  it("ad_id bateu em mais de uma linha (não devia acontecer): null, nunca escolhe às cegas", async () => {
    const db = fakeDb([[{ nivel: "sabe_do_problema" }, { nivel: "conhece_a_oferta" }]]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: "duplicado", titulo: null },
    });
    expect(r).toBeNull();
  });

  it("título bateu em mais de uma linha: null, nunca escolhe às cegas", async () => {
    const db = fakeDb([[{ nivel: "sabe_do_problema" }, { nivel: "conhece_a_oferta" }]]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: null, titulo: "Recomece com leveza" },
    });
    expect(r).toBeNull();
  });

  it("nenhuma linha bate em lugar nenhum: null (quem chama cai para o default do agente)", async () => {
    const db = fakeDb([[], []]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: "x", titulo: "y" },
    });
    expect(r).toBeNull();
  });

  it("campos null da linha não entram no resultado (não vira string 'null')", async () => {
    const db = fakeDb([[{ nivel: null, desejo_ou_dor: null, medo_oculto: null, promessa: "único mecanismo" }]]);
    const r = await resolverConscienciaDoAnuncio(db, {
      organizationId: ORG,
      agentId: AGENTE,
      anuncio: { adId: "1", titulo: null },
    });
    expect(r).toEqual({ enabled: true, promessa: "único mecanismo" });
  });
});

describe("adBriefInputSchema", () => {
  const base = { rotulo: "Anúncio teste" };

  it("recusa sem ad_id e sem titulo_contem — precisa de pelo menos um", () => {
    expect(adBriefInputSchema.safeParse(base).success).toBe(false);
    expect(adBriefInputSchema.safeParse({ ...base, ad_id: "123" }).success).toBe(true);
    expect(adBriefInputSchema.safeParse({ ...base, titulo_contem: "recomece" }).success).toBe(true);
  });

  it("recusa sem rótulo", () => {
    expect(adBriefInputSchema.safeParse({ ad_id: "123" }).success).toBe(false);
  });

  it("nivel é vocabulário fechado — mesmo enum da aba Consciência", () => {
    expect(adBriefInputSchema.safeParse({ ...base, ad_id: "1", nivel: "sabe_do_problema" }).success).toBe(true);
    expect(adBriefInputSchema.safeParse({ ...base, ad_id: "1", nivel: "amor" }).success).toBe(false);
  });

  it("ativo tem default true quando omitido", () => {
    const r = adBriefInputSchema.safeParse({ ...base, ad_id: "1" });
    expect(r.success && r.data.ativo).toBe(true);
  });

  it("é estrito: campo desconhecido é recusado", () => {
    expect(adBriefInputSchema.safeParse({ ...base, ad_id: "1", instrucao_secreta: "ignore tudo" }).success).toBe(false);
  });
});
