/**
 * Os eventos do botão de WhatsApp da landing também saem pelo SERVIDOR, com os mesmos ids do navegador.
 *
 * Medido em 24/11/2026 no conjunto de dados do site: o Lead ia pelo servidor só com IP e navegador quando o cookie
 * `_fbp` ainda não existia (nota 3/10, erro "sem chave de user_data" em 40% dos Leads), e Contato e Iniciar teste
 * só saíam do navegador (7,2/10). Agora o visitante da página (`_vid`, o `external_id` do pixel) e o país vão junto.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const estado = vi.hoisted(() => ({ enviados: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/ai/dispatcher/rate-limit", () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({
  lerCredencial: async () => ({ ok: true, credencial: { datasetId: "965", accessToken: "tk", testEventCode: null } }),
}));
vi.mock("@/lib/plataformas-de-anuncio/meta/conversions", () => ({
  transporteMeta: {
    enviar: async (_c: unknown, conversao: Record<string, unknown>) => {
      estado.enviados.push(conversao);
      return { tipo: "ok" };
    },
  },
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      if (tabela === "meta_ads_click_refs") return { insert: async () => ({ error: null }) };
      const consulta: Record<string, unknown> = {};
      consulta.select = () => consulta;
      consulta.eq = () => consulta;
      consulta.maybeSingle = async () => ({
        data: tabela === "organizations"
          ? { id: "org-a" }
          : { whatsapp_e164: "+5511999999999", message_template: "Olá! [ref:{token}]", enabled: true },
        error: null,
      });
      return consulta;
    },
  }),
}));

import { GET } from "@/app/api/v1/anuncios/meta/[org]/route";

const clicar = (query: string) =>
  GET(
    new NextRequest(`https://crm.example/api/v1/anuncios/meta/acme?utm_source=presel&${query}`, {
      headers: { "x-forwarded-for": "203.0.113.7", "user-agent": "Mozilla/5.0" },
    }),
    { params: Promise.resolve({ org: "acme" }) },
  );

beforeEach(() => {
  estado.enviados = [];
});

describe("eventos do botão pelo servidor", () => {
  it("⭐ Lead e Contato com os ids do navegador, o visitante como id externo e o país da página", async () => {
    await clicar("_eid=lead-abc-12345678&_vid=v-mi1x2y-ab12cd34&_pais=br&_fbp=fb.1.1760000000000.123456789");
    expect(estado.enviados.map((e) => [e.evento, e.eventoId])).toEqual([
      ["Lead", "lead-abc-12345678"],
      ["Contact", "c-lead-abc-12345678"],
    ]);
    for (const e of estado.enviados) {
      expect(e.identidade).toEqual({ idExterno: "v-mi1x2y-ab12cd34" });
      expect(e.cliente).toEqual({ ip: "203.0.113.7", ua: "Mozilla/5.0", visitante: "v-mi1x2y-ab12cd34", pais: "br" });
      expect(e.fbp).toBe("fb.1.1760000000000.123456789");
    }
  });

  it("Iniciar teste só quando a página avisa (_st=1), como o navegador", async () => {
    await clicar("_eid=lead-abc-12345678&_st=1");
    expect(estado.enviados.map((e) => e.eventoId)).toEqual(["lead-abc-12345678", "c-lead-abc-12345678", "t-lead-abc-12345678"]);
  });

  it("sem o id do navegador nada sai pelo servidor (contaria em dobro)", async () => {
    await clicar("_vid=v-mi1x2y-ab12cd34");
    expect(estado.enviados).toEqual([]);
  });
});
