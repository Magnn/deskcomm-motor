/**
 * Reenviar para quem falhou: um RASCUNHO novo só com essas pessoas — e o público
 * "só a lista" não pode trazer mais ninguém.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { reenviarFalhasAcao, type CampanhaCarregada } from "./acoes";
import { FILTRO_VAZIO, temRecorte, type FiltroDeAudiencia } from "./audiencia";
import { buscarCandidatos } from "./consulta-de-audiencia";

const ORIGINAL: CampanhaCarregada = {
  id: "camp-1",
  organization_id: "org-1",
  name: "Black Friday",
  status: "completed",
  channel_session_id: "sessao-1",
  message_body: "Oi {{nome}}",
  content_kind: "text",
  template_name: null,
  template_language: null,
  template_values: {},
  flow_pointer_id: null,
  base_legal: "consent",
  lia_ref: null,
  audience_filter: { ...FILTRO_VAZIO, com_alguma_tag: ["vip"] },
  audience_version: 3,
  content_version: 2,
  scheduled_at: "2026-10-01T12:00:00Z",
  intervalo_segundos: 30,
  janela_inicio_hora: 9,
  janela_fim_hora: 18,
  teto_diario: 200,
  teto_horario: null,
  description: null,
};

const destinatario = (contact_id: string | null, status: string, over: object = {}) => ({
  organization_id: "org-1",
  campaign_id: "camp-1",
  contact_id,
  status,
  ...over,
});

describe("reenviarFalhasAcao", () => {
  it("cria um rascunho só com quem FALHOU nesta campanha, sem repetir pessoa e sem herdar agenda", async () => {
    const b = criarBancoEmMemoria({
      campaigns: [],
      campaign_recipients: [
        destinatario("c1", "failed"),
        destinatario("c1", "failed"),
        destinatario("c2", "sent"),
        destinatario("c3", "failed"),
        destinatario(null, "failed"),
        destinatario("c9", "failed", { campaign_id: "outra" }),
        destinatario("c8", "failed", { organization_id: "org-2" }),
      ],
    });
    const r = await reenviarFalhasAcao(b.cliente as unknown as SupabaseClient, ORIGINAL, "user-1");
    expect(r).toMatchObject({ ok: true, pessoas: 2 });

    expect(b.tabelas.campaigns).toHaveLength(1);
    const nova = b.tabelas.campaigns![0]!;
    expect(nova).toMatchObject({
      organization_id: "org-1",
      name: "Black Friday (reenvio)",
      channel_session_id: "sessao-1",
      message_body: "Oi {{nome}}",
      created_by: "user-1",
    });
    const filtro = nova.audience_filter as FiltroDeAudiencia;
    expect(filtro.incluir_contatos).toEqual(["c1", "c3"]);
    expect(filtro.limite).toBe(2);
    // O recorte da original NÃO vem junto: senão o reenvio sairia para a lista inteira de novo.
    expect(temRecorte(filtro)).toBe(false);
    // Nem agenda nem estado: é uma intenção nova, que a pessoa confere antes de iniciar.
    expect(nova.scheduled_at ?? null).toBeNull();
    expect(nova.status ?? null).toBeNull();
  });

  it("sem nenhuma falha, recusa e não cria nada", async () => {
    const b = criarBancoEmMemoria({ campaigns: [], campaign_recipients: [destinatario("c2", "sent")] });
    const r = await reenviarFalhasAcao(b.cliente as unknown as SupabaseClient, ORIGINAL, "user-1");
    expect(r).toMatchObject({ ok: false, codigo: "campanha_sem_audiencia", status: 422 });
    expect(b.tabelas.campaigns).toHaveLength(0);
  });

  it("falha de leitura não vira \"ninguém falhou\"", async () => {
    const b = criarBancoEmMemoria({ campaigns: [], campaign_recipients: [destinatario("c1", "failed")] });
    b.falharProxima("campaign_recipients", "banco fora");
    const r = await reenviarFalhasAcao(b.cliente as unknown as SupabaseClient, ORIGINAL, "user-1");
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(b.tabelas.campaigns).toHaveLength(0);
  });
});

describe("público que é só uma lista", () => {
  const contato = (id: string) => ({
    id,
    organization_id: "org-1",
    name: id,
    display_name: null,
    phone_number: "+5511999990000",
    social_identity: null,
    is_blocked: false,
    is_anonymized: false,
    consent: null,
    is_merged_into: null,
    source: "site",
    created_at: `2026-10-0${id.slice(-1)}T00:00:00Z`,
  });
  const buscar = (filtro: FiltroDeAudiencia) =>
    buscarCandidatos(
      criarBancoEmMemoria({ contacts: [contato("c1"), contato("c2"), contato("c3"), contato("c4")] }).cliente as unknown as SupabaseClient,
      { organizationId: "org-1", filtro, agora: new Date("2026-10-10T00:00:00Z") },
    );

  it("traz SÓ os incluídos à mão — sem recorte, o resto da organização não entra", async () => {
    const candidatos = await buscar({ ...FILTRO_VAZIO, incluir_contatos: ["c3"], limite: 500 });
    expect(candidatos.map((c) => c.contactId)).toEqual(["c3"]);
  });

  it("com recorte, a lista SOMA ao recorte — o comportamento de sempre", async () => {
    const candidatos = await buscar({ ...FILTRO_VAZIO, origens: ["site"], incluir_contatos: ["c4"], limite: 2 });
    expect(candidatos.map((c) => c.contactId)).toEqual(["c1", "c2", "c4"]);
  });

  it("temRecorte: lista, exclusão e limite não são recorte; qualquer critério é", () => {
    expect(temRecorte({ ...FILTRO_VAZIO, incluir_contatos: ["c1"], excluir_contatos: ["c2"], limite: 10 })).toBe(false);
    expect(temRecorte({ ...FILTRO_VAZIO, sem_interacao_ha_dias: 30 })).toBe(true);
    expect(temRecorte({ ...FILTRO_VAZIO, sem_tags: ["frio"] })).toBe(true);
  });
});
