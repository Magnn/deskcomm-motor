/**
 * Campanha em canal POR CONVERSA (Telegram): o público é quem já falou com a
 * conta conectada, e o endereço é a identidade da pessoa nessa conta.
 */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { criarBancoEmMemoria } from "@/tests/helpers/banco-em-memoria";

import { FILTRO_VAZIO } from "./audiencia";
import { buscarCandidatos } from "./consulta-de-audiencia";
import { classificarAudiencia, enderecoDoContato, motivoParaExcluir, POR_TELEFONE, type CandidatoDaAudiencia, type ModoDeEndereco } from "./elegibilidade";

const TELEGRAM: ModoDeEndereco = { tipo: "conversa", prefixo: "telegram:7012345678:" };

const pessoa = (over: Partial<CandidatoDaAudiencia> = {}): CandidatoDaAudiencia => ({
  contactId: "c1",
  nome: "Ana",
  telefone: null,
  identidadeSocial: "telegram:7012345678:555",
  bloqueado: false,
  anonimizado: false,
  recusouMarketing: false,
  ...over,
});

describe("motivoParaExcluir — canal por conversa", () => {
  it("quem falou com ESTA conta recebe, mesmo sem telefone", () => {
    expect(motivoParaExcluir(pessoa(), TELEGRAM)).toBeNull();
    expect(enderecoDoContato(pessoa(), TELEGRAM)).toBe("telegram:7012345678:555");
  });

  it("quem falou com OUTRA conta da mesma rede, ou só tem WhatsApp, fica de fora com o motivo certo", () => {
    expect(motivoParaExcluir(pessoa({ identidadeSocial: "telegram:999:555" }), TELEGRAM)).toBe("sem_conversa_no_canal");
    expect(motivoParaExcluir(pessoa({ identidadeSocial: null, telefone: "+5511999990000" }), TELEGRAM)).toBe("sem_conversa_no_canal");
    // Só o prefixo, sem a pessoa, não é endereço.
    expect(motivoParaExcluir(pessoa({ identidadeSocial: "telegram:7012345678:" }), TELEGRAM)).toBe("sem_conversa_no_canal");
  });

  it("opt-out, anonimizado e recusa de marketing continuam vindo ANTES — o canal novo não fura veto", () => {
    expect(motivoParaExcluir(pessoa({ bloqueado: true }), TELEGRAM)).toBe("opt_out");
    expect(motivoParaExcluir(pessoa({ anonimizado: true }), TELEGRAM)).toBe("anonimizado");
    expect(motivoParaExcluir(pessoa({ recusouMarketing: true }), TELEGRAM)).toBe("recusou_marketing");
  });

  it("por telefone, nada mudou: sem o modo, vale a regra de sempre", () => {
    expect(motivoParaExcluir(pessoa())).toBe("sem_telefone");
    expect(motivoParaExcluir(pessoa({ telefone: "11999" }), POR_TELEFONE)).toBe("telefone_invalido");
    expect(motivoParaExcluir(pessoa({ telefone: "+5511999990000" }))).toBeNull();
  });
});

describe("classificarAudiencia — canal por conversa", () => {
  it("o endereço gravado é a identidade na conta, e dois cadastros da mesma pessoa não recebem em dobro", () => {
    const linhas = classificarAudiencia(
      [pessoa(), pessoa({ contactId: "c2" }), pessoa({ contactId: "c3", identidadeSocial: "telegram:7012345678:777" })],
      {
        excluidosAMao: new Set(),
        jaEmCampanha: new Set(),
        suprimidos: new Set(),
        modo: TELEGRAM,
        hashDoEndereco: (e) => `h(${e})`,
        renderizar: () => ({ texto: "oi", faltando: [] }),
      },
    );
    expect(linhas.map((l) => [l.candidato.contactId, l.endereco, l.motivo])).toEqual([
      ["c1", "telegram:7012345678:555", null],
      ["c2", null, "duplicado"],
      ["c3", "telegram:7012345678:777", null],
    ]);
  });
});

describe("buscarCandidatos — canal por conversa", () => {
  it("o recorte já vem só com quem falou com a conta: o limite conta gente que pode receber", async () => {
    const contato = (id: string, identidade: string | null) => ({
      id,
      organization_id: "org-1",
      name: id,
      display_name: null,
      phone_number: identidade ? null : "+5511999990000",
      social_identity: identidade,
      is_blocked: false,
      is_anonymized: false,
      consent: null,
      is_merged_into: null,
      tags: ["lead"],
      source: "site",
      created_at: `2026-10-0${id.slice(-1)}T00:00:00Z`,
    });
    const b = criarBancoEmMemoria({
      contacts: [contato("w1", null), contato("w2", null), contato("t3", "telegram:7012345678:555"), contato("o4", "telegram:999:1")],
    });
    const candidatos = await buscarCandidatos(b.cliente as unknown as SupabaseClient, {
      organizationId: "org-1",
      // Um recorte de verdade: público sem critério nenhum não traz ninguém.
      filtro: { ...FILTRO_VAZIO, origens: ["site"], limite: 2 },
      agora: new Date("2026-10-10T00:00:00Z"),
      modo: TELEGRAM,
    });
    // Com limite 2 e SEM o filtro no banco, viriam os dois de WhatsApp e ninguém do Telegram.
    expect(candidatos.map((c) => c.contactId)).toEqual(["t3"]);
    expect(candidatos[0]?.identidadeSocial).toBe("telegram:7012345678:555");
  });
});
