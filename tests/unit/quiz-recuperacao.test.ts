/**
 * A recuperação de quem viu a prévia do quiz e não pagou (migration 0960): o 1º e-mail 1 h depois, o 2º 23 h depois
 * do 1º, no idioma do quiz, com o link que reabre a prévia; ninguém que pagou, pediu para sair ou não tem e-mail.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/branding/saida", () => ({ marcaDaSaida: async () => ({ nome: "Casa" }) }));

import { dadosDoLead, leadDoQuizSchema } from "@/lib/area-do-cliente/lead-do-quiz";
import {
  dadosDaRetomadaSchema,
  emailDaRecuperacao,
  etapaDaRecuperacao,
  recuperarQuizzes,
  type VisitaParaRecuperar,
} from "@/lib/area-do-cliente/recuperacao-do-quiz";
import { IDIOMAS_DA_AREA } from "@/lib/i18n/area";

const AGORA = new Date("2026-11-06T15:00:00Z");
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3_600_000).toISOString();

const VISITA: VisitaParaRecuperar = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  contact_id: "33333333-3333-4333-8333-333333333333",
  quiz: "sinastria",
  idioma: "pt-PT",
  primeiro_em: horasAtras(2.2),
  visto_em: horasAtras(2),
  recuperacoes: 0,
  recuperacao_em: null,
  recuperacao_chave: "44444444-4444-4444-8444-444444444444",
};
const ORG = { id: VISITA.organization_id, slug: "cigana", settings: { area: { ativo: true, titulo: "Meu Mistério", dominio: "https://meumisterio.com" } } };
const CONTATO = { id: VISITA.contact_id, organization_id: VISITA.organization_id, name: "Ana Paula", email: "ana@exemplo.pt", consent: {}, is_anonymized: false };

function bancoFalso(t: { visitas: unknown[]; contatos?: unknown[]; compras?: unknown[] }) {
  const escritas: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const admin = {
    from(tabela: string) {
      let op = "select";
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "lt", "lte", "gte", "order", "limit", "in"]) cadeia[m] = () => cadeia;
      cadeia.update = (v: Record<string, unknown>) => {
        op = "update";
        escritas.push({ tabela, valores: v });
        return cadeia;
      };
      const responder = () => {
        if (op === "update") return { data: [{ id: "x" }], error: null };
        if (tabela === "area_quiz_visitas") return { data: t.visitas, error: null };
        if (tabela === "organizations") return { data: [ORG], error: null };
        if (tabela === "contacts") return { data: t.contatos ?? [CONTATO], error: null };
        return { data: t.compras ?? [], error: null };
      };
      cadeia.then = (ok: (r: unknown) => unknown) => Promise.resolve(responder()).then(ok);
      return cadeia;
    },
  } as unknown as SupabaseClient;
  return { admin, escritas };
}

describe("recuperação do quiz", () => {
  it("⭐ o 1º sai 1 h depois da visita (até 3 dias); o 2º, 23 h depois do 1º; depois do 2º, nada", () => {
    expect(etapaDaRecuperacao({ visto_em: horasAtras(0.5), recuperacoes: 0, recuperacao_em: null }, AGORA)).toBeNull();
    expect(etapaDaRecuperacao({ visto_em: horasAtras(1.1), recuperacoes: 0, recuperacao_em: null }, AGORA)).toBe(1);
    expect(etapaDaRecuperacao({ visto_em: horasAtras(80), recuperacoes: 0, recuperacao_em: null }, AGORA)).toBeNull();
    expect(etapaDaRecuperacao({ visto_em: horasAtras(12), recuperacoes: 1, recuperacao_em: horasAtras(10) }, AGORA)).toBeNull();
    expect(etapaDaRecuperacao({ visto_em: horasAtras(25), recuperacoes: 1, recuperacao_em: horasAtras(24) }, AGORA)).toBe(2);
    expect(etapaDaRecuperacao({ visto_em: horasAtras(50), recuperacoes: 2, recuperacao_em: horasAtras(24) }, AGORA)).toBeNull();
  });

  it("⭐ o e-mail sai no idioma do quiz, com o link inteiro (o &k= não some no HTML)", () => {
    const link = "https://meumisterio.com/c/cigana/sinastria?retomar=a&k=b";
    const en = emailDaRecuperacao({ etapa: 1, quiz: "sinastria", idioma: "en", marca: "Meu Mistério", nomeDaPessoa: "Ana Paula", link, sair: "https://x/sair?v=a&k=b" });
    expect(en.subject).toBe("Your preview is saved · Are you a match?");
    expect(en.text).toContain("Hi, Ana.");
    expect(en.html).toContain('href="https://meumisterio.com/c/cigana/sinastria?retomar=a&amp;k=b"');
    expect(en.html).toContain('href="https://x/sair?v=a&amp;k=b"');
    // Nenhuma frase do e-mail fica em português nos outros cinco idiomas.
    for (const idioma of IDIOMAS_DA_AREA.filter((i) => i !== "pt-BR")) {
      for (const etapa of [1, 2] as const) {
        const m = emailDaRecuperacao({ etapa, quiz: "caminhos", idioma, marca: "M", nomeDaPessoa: null, link, sair: link });
        expect(m.text, `${idioma} ${etapa}`).not.toMatch(/A sua prévia|Ver a minha prévia|Ela continua guardada|Sair da lista|Oi\./);
      }
    }
  });

  it("⭐ a rodada manda o 1º, marca a visita antes e leva o link de retomada", async () => {
    const { admin, escritas } = bancoFalso({ visitas: [VISITA] });
    const mandar = vi.fn(async () => ({ ok: true }));
    const r = await recuperarQuizzes(admin, AGORA, mandar);
    expect(r).toEqual({ enviados: 1, ja_pagaram: 0, sem_email: 0, falhas: 0 });
    expect(escritas[0]!.valores).toEqual({ recuperacoes: 1, recuperacao_em: AGORA.toISOString() });
    const enviado = (mandar.mock.calls[0] as unknown as [{ to: string; subject: string; text: string; fromName: string }])[0];
    expect(enviado.to).toBe("ana@exemplo.pt");
    expect(enviado.fromName).toBe("Meu Mistério");
    expect(enviado.subject).toBe("A sua prévia está guardada · Vocês combinam?");
    expect(enviado.text).toContain(`https://meumisterio.com/c/cigana/sinastria?retomar=${VISITA.id}&k=${VISITA.recuperacao_chave}`);
    expect(enviado.text).toContain(`https://meumisterio.com/api/v1/area/publica/cigana/sair?v=${VISITA.id}&k=${VISITA.recuperacao_chave}`);
  });

  it("não manda para quem pagou depois da visita, pediu para sair, não tem e-mail ou é de outra empresa", async () => {
    const pagou = await recuperarQuizzes(
      bancoFalso({ visitas: [VISITA], compras: [{ organization_id: VISITA.organization_id, contact_id: VISITA.contact_id, created_at: horasAtras(1.5) }] }).admin,
      AGORA,
      vi.fn(),
    );
    expect(pagou.ja_pagaram).toBe(1);
    const saiu = await recuperarQuizzes(bancoFalso({ visitas: [VISITA], contatos: [{ ...CONTATO, consent: { marketing: { declined_at: horasAtras(3) } } }] }).admin, AGORA, vi.fn());
    const semEmail = await recuperarQuizzes(bancoFalso({ visitas: [VISITA], contatos: [{ ...CONTATO, email: null }] }).admin, AGORA, vi.fn());
    const outra = await recuperarQuizzes(bancoFalso({ visitas: [VISITA], contatos: [{ ...CONTATO, organization_id: "outra" }] }).admin, AGORA, vi.fn());
    for (const r of [saiu, semEmail, outra]) expect(r).toEqual({ enviados: 0, ja_pagaram: 0, sem_email: 1, falhas: 0 });
  });

  it("a mesma pessoa no mesmo quiz duas vezes recebe um e-mail só; envio que falha desmarca a visita", async () => {
    const velha = { ...VISITA, id: "55555555-5555-4555-8555-555555555555", visto_em: horasAtras(30) };
    const mandar = vi.fn(async () => ({ ok: true }));
    expect((await recuperarQuizzes(bancoFalso({ visitas: [VISITA, velha] }).admin, AGORA, mandar)).enviados).toBe(1);

    const { admin, escritas } = bancoFalso({ visitas: [VISITA] });
    const r = await recuperarQuizzes(admin, AGORA, async () => ({ ok: false }));
    expect(r.falhas).toBe(1);
    expect(escritas.at(-1)!.valores).toEqual({ recuperacoes: 0, recuperacao_em: null });
  });

  it("o que o lead grava na visita é o que a página lê para reabrir a prévia", () => {
    const lead = leadDoQuizSchema.parse({
      visita: VISITA.id,
      quiz: "sinastria",
      nome: "Ana",
      email: "Ana@Exemplo.pt",
      nascimento: "1990-08-10",
      nome_dele: "Rui",
      nascimento_dele: "1988-01-15",
      respostas: { momento: "Estamos juntos" },
    });
    expect(dadosDaRetomadaSchema.parse(dadosDoLead(lead))).toEqual({
      nome: "Ana",
      email: "ana@exemplo.pt",
      nascimento: "1990-08-10",
      nome_dele: "Rui",
      nascimento_dele: "1988-01-15",
      respostas: { momento: "Estamos juntos" },
    });
  });
});
