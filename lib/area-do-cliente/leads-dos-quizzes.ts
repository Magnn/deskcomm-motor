/**
 * OS LEADS DOS QUIZZES para a equipe: quem deu o e-mail num quiz da página (`lead-do-quiz.ts`) ou pediu o
 * pagamento, com até onde chegou no funil, de qual campanha veio e de onde. É a lista para recuperar quem viu a
 * prévia e não comprou — e para exportar (CSV na tela) para remarketing.
 *
 * Lê as visitas com contato (migration 0944) e os contatos delas pela sessão da equipe (RLS). Até 500 por período.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

import type { PassoDoQuiz, QuizDaPagina } from "./passos-do-quiz";

export interface LeadDeQuiz {
  contactId: string;
  nome: string | null;
  email: string | null;
  nascimento: string | null;
  quiz: QuizDaPagina;
  ateOnde: PassoDoQuiz;
  campanha: string | null;
  regiao: string | null;
  celular: boolean | null;
  chegouEm: string;
  vistoEm: string;
}

export const LIMITE_DE_LEADS = 500;

export async function lerLeadsDosQuizzes(db: SupabaseClient, orgId: string, desde: Date): Promise<{ leads: LeadDeQuiz[]; truncado: boolean }> {
  const { data, error } = await db
    .from("area_quiz_visitas")
    .select("contact_id, quiz, passo, campanha, regiao, celular, primeiro_em, visto_em")
    .eq("organization_id", orgId)
    .not("contact_id", "is", null)
    .gte("visto_em", desde.toISOString())
    .order("visto_em", { ascending: false })
    .limit(LIMITE_DE_LEADS);
  if (error) throw new Error(error.message);
  const visitas = (data ?? []) as Array<{
    contact_id: string;
    quiz: QuizDaPagina;
    passo: PassoDoQuiz;
    campanha: string | null;
    regiao: string | null;
    celular: boolean | null;
    primeiro_em: string;
    visto_em: string;
  }>;
  const ids = [...new Set(visitas.map((v) => v.contact_id))];
  const contatos = new Map<string, { nome: string | null; email: string | null; nascimento: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: lote, error: erro } = await db
      .from("contacts")
      .select("id, name, display_name, email, birthdate")
      .eq("organization_id", orgId)
      .in("id", ids.slice(i, i + 200));
    if (erro) throw new Error(erro.message);
    for (const c of (lote ?? []) as Array<{ id: string; name: string | null; display_name: string | null; email: string | null; birthdate: string | null }>) {
      contatos.set(c.id, { nome: nomeDoContato(c), email: c.email, nascimento: c.birthdate });
    }
  }
  // Uma linha por pessoa e quiz: a visita mais recente (a lista já vem do mais recente para o mais antigo).
  const vistos = new Set<string>();
  const leads: LeadDeQuiz[] = [];
  for (const v of visitas) {
    const chave = `${v.contact_id}|${v.quiz}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const c = contatos.get(v.contact_id);
    leads.push({
      contactId: v.contact_id,
      nome: c?.nome ?? null,
      email: c?.email ?? null,
      nascimento: c?.nascimento ?? null,
      quiz: v.quiz,
      ateOnde: v.passo,
      campanha: v.campanha,
      regiao: v.regiao,
      celular: v.celular,
      chegouEm: v.primeiro_em,
      vistoEm: v.visto_em,
    });
  }
  return { leads, truncado: visitas.length >= LIMITE_DE_LEADS };
}

/** O CSV da lista (separador ";" e BOM, para abrir certo no Excel em português). */
export function csvDosLeads(leads: readonly LeadDeQuiz[], rotuloDoPasso: (p: PassoDoQuiz) => string): string {
  const campo = (v: string | null | undefined) => {
    const s = (v ?? "").replace(/"/g, '""');
    return /[;"\n]/.test(s) ? `"${s}"` : s;
  };
  const linhas = [
    ["nome", "email", "nascimento", "quiz", "ate_onde_chegou", "campanha", "regiao", "aparelho", "chegou_em"].join(";"),
    ...leads.map((l) =>
      [
        campo(l.nome),
        campo(l.email),
        campo(l.nascimento),
        campo(l.quiz),
        campo(rotuloDoPasso(l.ateOnde)),
        campo(l.campanha),
        campo(l.regiao),
        l.celular === null ? "" : l.celular ? "celular" : "computador",
        campo(l.chegouEm),
      ].join(";"),
    ),
  ];
  return "﻿" + linhas.join("\n");
}
