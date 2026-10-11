/**
 * LINK DE PAGAMENTO ENVIADO → PASSO REPORTADO À PLATAFORMA DE ANÚNCIO.
 *
 * O risco deste caminho é o mesmo da venda: evento em dobro, evento velho com data de hoje, ou
 * evento de quem não veio de anúncio. Cada teste segura uma dessas portas.
 */
import { readFileSync } from "node:fs";

import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const lerAtribuicao = vi.fn();
const lerCredencial = vi.fn();
const lerDestinoDeMensageria = vi.fn();
const jaFoiEnviada = vi.fn();
const registraEnvio = vi.fn();
const enviar = vi.fn();

vi.mock("@/lib/conversoes/leitura-da-atribuicao", () => ({ lerAtribuicao: (...a: unknown[]) => lerAtribuicao(...a) }));
vi.mock("@/lib/plataformas-de-anuncio/credenciais", () => ({ lerCredencial: (...a: unknown[]) => lerCredencial(...a) }));
vi.mock("@/lib/conversoes/destino-de-mensageria", () => ({ lerDestinoDeMensageria: (...a: unknown[]) => lerDestinoDeMensageria(...a) }));
vi.mock("@/lib/conversoes/registro-de-envio", () => ({
  jaFoiEnviada: (...a: unknown[]) => jaFoiEnviada(...a),
  registraEnvio: (...a: unknown[]) => registraEnvio(...a),
}));
vi.mock("@/lib/plataformas-de-anuncio/registry", () => ({ transporteDe: () => ({ enviar: (...a: unknown[]) => enviar(...a) }) }));

import { EVENTO_DO_LINK_DE_PAGAMENTO, reportarEventoDaConversa } from "@/lib/conversoes/evento-da-conversa";

const AGORA = new Date("2026-10-10T20:00:00Z");
const admin = {
  from: () => ({
    select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { id: "lead-1" } }) }) }) }) }) }),
  }),
} as unknown as SupabaseClient;
const passo = (em = "2026-10-10T19:55:00Z") => ({ organizationId: "org", contactId: "c1", evento: EVENTO_DO_LINK_DE_PAGAMENTO, ocorridoEm: new Date(em) });

beforeEach(() => {
  vi.clearAllMocks();
  lerAtribuicao.mockResolvedValue({ temAtribuicao: true, atribuicao: { plataforma: "meta_ads", cliqueDeOrigem: "clique-1", telefone: "5511999990000" } });
  lerCredencial.mockResolvedValue({ ok: true, credencial: { datasetId: "da-tela", accessToken: "t-tela" } });
  lerDestinoDeMensageria.mockResolvedValue({ ok: true, destino: { datasetId: "do-canal", accessToken: "t-canal", contaDoWhatsApp: "waba-1" } });
  jaFoiEnviada.mockResolvedValue(false);
  enviar.mockResolvedValue({ tipo: "ok", detalhe: "aceito" });
});

describe("reportarEventoDaConversa", () => {
  it("⭐ reporta InitiateCheckout no conjunto de dados do CANAL, com o clique, a conta e a hora em que o link saiu — sem valor", async () => {
    const d = await reportarEventoDaConversa(admin, passo(), AGORA);
    expect(d).toEqual({ status: "sent", motivo: null });
    const [credencial, conversao] = enviar.mock.calls[0]!;
    expect(credencial).toMatchObject({ datasetId: "do-canal", accessToken: "t-canal" });
    expect(conversao).toMatchObject({
      evento: "InitiateCheckout",
      eventoId: "lead-1:InitiateCheckout",
      cliqueDeOrigem: "clique-1",
      contaDoWhatsApp: "waba-1",
      valorCentavos: null,
    });
    expect((conversao as { ocorridoEm: Date }).ocorridoEm.toISOString()).toBe("2026-10-10T19:55:00.000Z");
    expect(registraEnvio).toHaveBeenCalledWith(admin, expect.objectContaining({ status: "sent", evento: "InitiateCheckout", leadId: "lead-1" }));
  });

  it("⭐ uma vez por negócio: o segundo link da mesma conversa não reenvia", async () => {
    jaFoiEnviada.mockResolvedValue(true);
    expect(await reportarEventoDaConversa(admin, passo(), AGORA)).toEqual({ status: "skipped", motivo: "ja_enviada" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("⭐ quem não veio de anúncio não é reportado nem vira pendência na tela", async () => {
    lerAtribuicao.mockResolvedValue({ temAtribuicao: false, motivo: "sem_atribuicao" });
    expect(await reportarEventoDaConversa(admin, passo(), AGORA)).toEqual({ status: "skipped", motivo: "sem_atribuicao" });
    expect(enviar).not.toHaveBeenCalled();
    expect(registraEnvio).not.toHaveBeenCalled();
  });

  it("⭐ link de ontem não vira evento de hoje", async () => {
    expect(await reportarEventoDaConversa(admin, passo("2026-10-09T10:00:00Z"), AGORA)).toEqual({ status: "skipped", motivo: "passo_antigo" });
    expect(lerAtribuicao).not.toHaveBeenCalled();
  });

  it("envio de conversões desligado na organização: nada sai", async () => {
    lerCredencial.mockResolvedValue({ ok: false, motivo: "sem_conexao" });
    expect(await reportarEventoDaConversa(admin, passo(), AGORA)).toEqual({ status: "skipped", motivo: "sem_conexao" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("recusa da plataforma fica registrada, com o motivo", async () => {
    enviar.mockResolvedValue({ tipo: "permanente", detalhe: "evento não aceito" });
    expect(await reportarEventoDaConversa(admin, passo(), AGORA)).toEqual({ status: "error", motivo: "recusado_pela_plataforma" });
    expect(registraEnvio).toHaveBeenCalledWith(admin, expect.objectContaining({ status: "error", detalhe: "evento não aceito" }));
  });
});

describe("a fiação", () => {
  it("a rotina dos marcos entrega os links enviados, e a falha de um passo não derruba a rotina", () => {
    const rota = readFileSync("app/api/v1/cron/marcos-da-conversa/route.ts", "utf8");
    expect(rota).toContain("links.push(...r.linksDePagamento)");
    expect(rota).toContain("evento: EVENTO_DO_LINK_DE_PAGAMENTO");
    expect(rota).toContain('logger.warn("[cron.marcos-da-conversa] passo não reportado"');
  });
});
