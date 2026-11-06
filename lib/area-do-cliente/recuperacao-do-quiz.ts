/**
 * A RECUPERAÇÃO DE QUEM VIU A PRÉVIA DO QUIZ E NÃO PAGOU (migration 0960), de 15 em 15 minutos
 * (`/api/v1/cron/area-quiz-recupera`).
 *
 * Medido em 06/11/2026 no teste de Portugal: quem deu o e-mail, leu a prévia por 9 minutos e não pagou virou
 * contato e ninguém voltou a falar com ele. Agora são dois e-mails, no idioma em que a pessoa fez o quiz:
 *   1º — 1 h depois do último sinal da visita (`visto_em`), até 3 dias;
 *   2º — 23 h depois do 1º, até 7 dias da visita.
 * O link reabre a prévia JÁ CALCULADA (`dados`, gravado com o e-mail) — a pessoa não refaz nada; ela escolhe pagar.
 *
 * Quem não recebe: quem já pagou algum quiz depois da visita, quem pediu para não receber
 * (`consent.marketing.declined_at`, o mesmo de campanhas e automações), contato anonimizado ou sem e-mail, e a
 * visita mais velha quando o mesmo contato fez o mesmo quiz de novo. Todo e-mail tem o link de sair.
 *
 * Contra o e-mail em dobro: a visita é marcada (`recuperacoes` + 1, só se ainda estava no número lido) ANTES de
 * mandar; envio que falha desmarca, e a rodada seguinte tenta de novo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { lerConfigDaArea } from "@/lib/area-do-cliente/config";
import { caminhoDaArea, origemDaArea } from "@/lib/area-do-cliente/vocabulario";
import { marcaDaSaida } from "@/lib/branding/saida";
import { sendEmail } from "@/lib/email/roteador";
import { env } from "@/lib/env";
import { idiomaDaAreaOuNulo, traduzirNaArea, type IdiomaDaArea } from "@/lib/i18n/area";

import { QUIZZES, type Quiz } from "./passos-do-quiz";

const HORA = 3_600_000;
export const HORAS_ATE_O_PRIMEIRO = 1;
export const HORAS_ENTRE_OS_DOIS = 23;
const DIAS_DO_PRIMEIRO = 3;
const DIAS_DO_SEGUNDO = 7;
const POR_RODADA = 100;
/** Passos de quem chegou à prévia e não pagou (o passo da visita é o mais adiantado). */
const PASSOS_SEM_PAGAR = ["email", "previa", "pagar", "cobranca"] as const;

const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** O que a visita guarda para a prévia reabrir. Lido do banco: valida de novo antes de ir à página. */
export const dadosDaRetomadaSchema = z.object({
  nome: z.string().trim().min(1).max(80),
  email: z.string().trim().max(200),
  nascimento: data.optional(),
  nome_dele: z.string().trim().max(80).optional(),
  nascimento_dele: data.optional(),
  respostas: z.record(z.string().max(20), z.string().max(200)).default({}),
});
export type DadosDaRetomada = z.infer<typeof dadosDaRetomadaSchema>;

export interface VisitaParaRecuperar {
  id: string;
  organization_id: string;
  contact_id: string;
  quiz: Quiz;
  idioma: string | null;
  primeiro_em: string;
  visto_em: string;
  recuperacoes: number;
  recuperacao_em: string | null;
  recuperacao_chave: string;
}

/** Pura: qual e-mail a visita recebe agora — 1, 2 ou nenhum. */
export function etapaDaRecuperacao(v: Pick<VisitaParaRecuperar, "visto_em" | "recuperacoes" | "recuperacao_em">, agora: Date): 1 | 2 | null {
  const visto = new Date(v.visto_em).getTime();
  const t = agora.getTime();
  if (v.recuperacoes === 0) {
    return visto <= t - HORAS_ATE_O_PRIMEIRO * HORA && visto >= t - DIAS_DO_PRIMEIRO * 24 * HORA ? 1 : null;
  }
  if (v.recuperacoes === 1 && v.recuperacao_em) {
    return new Date(v.recuperacao_em).getTime() <= t - HORAS_ENTRE_OS_DOIS * HORA && visto >= t - DIAS_DO_SEGUNDO * 24 * HORA ? 2 : null;
  }
  return null;
}

/** O caminho do quiz na área (o mesmo das "outras leituras"). */
export function caminhoDoQuiz(slug: string, quiz: Quiz): string {
  return quiz === "sinastria" ? `${caminhoDaArea(slug)}/sinastria` : `${caminhoDaArea(slug)}/quiz/${quiz}`;
}

export function linkDaRetomada(origem: string, slug: string, quiz: Quiz, id: string, chave: string): string {
  return `${origem}${caminhoDoQuiz(slug, quiz)}?retomar=${id}&k=${chave}`;
}

export function linkDeSair(origem: string, slug: string, id: string, chave: string): string {
  return `${origem}/api/v1/area/publica/${slug}/sair?v=${id}&k=${chave}`;
}

/** O título do quiz como a pessoa o viu (pt é a chave; os dicionários da área já têm as traduções). */
const TITULO_DO_QUIZ: Record<Quiz, string> = {
  sinastria: "Vocês combinam?",
  par: "Com quem você combina de verdade?",
  prosperidade: "Qual é o seu número da prosperidade?",
  caminhos: "O que abre os seus caminhos?",
};

const semHtml = (t: string) => t.replace(/[<>&"]/g, "");
/** Para o `href`: escapa em vez de apagar (o link leva `&k=`). */
const noAtributo = (t: string) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const DOURADO = "#9a7420";

export type EmailDaRecuperacao = { fromName: string; subject: string; text: string; html: string };

/** Pura: o e-mail da recuperação, no idioma em que a pessoa fez o quiz. */
export function emailDaRecuperacao(args: {
  etapa: 1 | 2;
  quiz: Quiz;
  idioma: IdiomaDaArea;
  marca: string;
  nomeDaPessoa: string | null;
  link: string;
  sair: string;
}): EmailDaRecuperacao {
  const t = (s: string) => traduzirNaArea(s, args.idioma);
  const primeiro = (args.nomeDaPessoa ?? "").trim().split(/\s+/)[0] ?? "";
  const titulo = t(TITULO_DO_QUIZ[args.quiz]);
  const ola = primeiro ? `${t("Oi")}, ${primeiro}.` : `${t("Oi")}.`;
  const linhas =
    args.etapa === 1
      ? [t("A sua prévia ficou guardada, do jeito que você deixou."), t("A leitura completa está pronta para ser escrita para você. Toque no botão para voltar exatamente onde parou.")]
      : [t("Ontem você começou e parou na prévia."), t("Ela continua guardada para você. Se quiser a leitura completa, é só voltar por aqui.")];
  const botao = t("Ver a minha prévia");
  const rodape = t("Não quer mais receber estes e-mails?");
  const sairTexto = t("Sair da lista");
  const text = [args.marca, "", ola, "", ...linhas, "", `${botao}: ${args.link}`, "", `${rodape} ${sairTexto}: ${args.sair}`].join("\n");
  const html = `<div style="background:#f7f4ee;padding:32px 12px;font-family:Georgia,'Times New Roman',serif">
<div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px 28px;border:1px solid #ece4d3">
<p style="margin:0;font-size:22px;color:${DOURADO};text-align:center">&#9790;</p>
<p style="margin:6px 0 24px;font-size:12px;letter-spacing:4px;text-transform:uppercase;color:${DOURADO};text-align:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(args.marca)}</p>
<p style="margin:0 0 6px;font-size:13px;color:#6b6475;text-align:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(titulo)}</p>
<p style="margin:14px 0 14px;font-size:17px;color:#2a2233">${semHtml(ola)}</p>
${linhas.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#2a2233;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(l)}</p>`).join("\n")}
<p style="margin:22px 0 0;text-align:center"><a href="${noAtributo(args.link)}" style="display:inline-block;background:${DOURADO};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-size:15px;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(botao)}</a></p>
</div>
<p style="max-width:440px;margin:16px auto 0;font-size:12px;color:#8a8294;text-align:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif">${semHtml(rodape)} <a href="${noAtributo(args.sair)}" style="color:#8a8294">${semHtml(sairTexto)}</a></p>
</div>`;
  const subject = args.etapa === 1 ? `${t("A sua prévia está guardada")} · ${titulo}` : `${t("Ainda guardada para você")} · ${titulo}`;
  return { fromName: args.marca, subject, text, html };
}

export interface RodadaDaRecuperacao {
  enviados: number;
  ja_pagaram: number;
  sem_email: number;
  falhas: number;
}

type MandarEmail = (args: Parameters<typeof sendEmail>[0]) => Promise<{ ok: boolean }>;

const COLUNAS = "id, organization_id, contact_id, quiz, idioma, primeiro_em, visto_em, recuperacoes, recuperacao_em, recuperacao_chave";

export async function recuperarQuizzes(admin: SupabaseClient, agora: Date, mandar: MandarEmail = sendEmail): Promise<RodadaDaRecuperacao> {
  const r: RodadaDaRecuperacao = { enviados: 0, ja_pagaram: 0, sem_email: 0, falhas: 0 };
  const { data, error } = await admin
    .from("area_quiz_visitas")
    .select(COLUNAS)
    .not("contact_id", "is", null)
    .not("dados", "is", null)
    .lt("recuperacoes", 2)
    .in("passo", [...PASSOS_SEM_PAGAR])
    .in("quiz", [...QUIZZES])
    .gte("visto_em", new Date(agora.getTime() - DIAS_DO_SEGUNDO * 24 * HORA).toISOString())
    .lte("visto_em", new Date(agora.getTime() - HORAS_ATE_O_PRIMEIRO * HORA).toISOString())
    .order("visto_em", { ascending: false })
    .limit(POR_RODADA);
  if (error) throw new Error(error.message);
  const todas = (data ?? []) as VisitaParaRecuperar[];
  // A mesma pessoa no mesmo quiz duas vezes: só a visita mais nova (a lista vem da mais nova para a mais velha).
  const vistas = new Set<string>();
  const visitas = todas.filter((v) => {
    const k = `${v.organization_id}:${v.contact_id}:${v.quiz}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return etapaDaRecuperacao(v, agora) !== null;
  });
  if (visitas.length === 0) return r;

  const orgIds = [...new Set(visitas.map((v) => v.organization_id))];
  const contactIds = [...new Set(visitas.map((v) => v.contact_id))];
  const [{ data: orgs, error: e1 }, { data: contatos, error: e2 }, { data: compras, error: e3 }] = await Promise.all([
    admin.from("organizations").select("id, slug, settings").in("id", orgIds),
    admin.from("contacts").select("id, organization_id, name, email, consent, is_anonymized").in("organization_id", orgIds).in("id", contactIds),
    admin
      .from("area_eventos")
      .select("organization_id, contact_id, created_at")
      .in("organization_id", orgIds)
      .in("contact_id", contactIds)
      .in("tipo", ["quiz_pago", "sinastria_paga"]),
  ]);
  if (e1 || e2 || e3) throw new Error((e1 ?? e2 ?? e3)!.message);
  type Org = { id: string; slug: string; settings: unknown };
  type Contato = { id: string; organization_id: string; name: string | null; email: string | null; consent: { marketing?: { declined_at?: string } } | null; is_anonymized: boolean | null };
  const orgPorId = new Map(((orgs ?? []) as Org[]).map((o) => [o.id, o]));
  const contatoPorId = new Map(((contatos ?? []) as Contato[]).map((c) => [c.id, c]));
  const compraDepois = (v: VisitaParaRecuperar) =>
    ((compras ?? []) as Array<{ organization_id: string; contact_id: string; created_at: string }>).some(
      (c) => c.organization_id === v.organization_id && c.contact_id === v.contact_id && c.created_at >= v.primeiro_em,
    );

  for (const v of visitas) {
    const org = orgPorId.get(v.organization_id);
    const contato = contatoPorId.get(v.contact_id);
    if (!org) continue;
    // O contato tem de ser da MESMA empresa da visita (o cliente admin não filtra sozinho).
    const email = contato && contato.organization_id === v.organization_id && !contato.is_anonymized ? contato.email?.trim() : null;
    if (!email || contato?.consent?.marketing?.declined_at) {
      r.sem_email++;
      continue;
    }
    if (compraDepois(v)) {
      r.ja_pagaram++;
      continue;
    }
    const etapa = etapaDaRecuperacao(v, agora)!;
    const { data: marcada, error: erroMarca } = await admin
      .from("area_quiz_visitas")
      .update({ recuperacoes: v.recuperacoes + 1, recuperacao_em: agora.toISOString() })
      .eq("id", v.id)
      .eq("recuperacoes", v.recuperacoes)
      .select("id");
    if (erroMarca) throw new Error(erroMarca.message);
    if (!marcada || marcada.length === 0) continue;

    const area = lerConfigDaArea(org.settings);
    const origem = origemDaArea(area.dominio, env.NEXT_PUBLIC_APP_URL ?? "");
    const marca = (area.titulo ?? "").trim() || (await marcaDaSaida(v.organization_id)).nome;
    const msg = emailDaRecuperacao({
      etapa,
      quiz: v.quiz,
      idioma: idiomaDaAreaOuNulo(v.idioma) ?? "pt-BR",
      marca,
      nomeDaPessoa: contato?.name ?? null,
      link: linkDaRetomada(origem, org.slug, v.quiz, v.id, v.recuperacao_chave),
      sair: linkDeSair(origem, org.slug, v.id, v.recuperacao_chave),
    });
    const envio = await mandar({
      to: email,
      subject: msg.subject,
      fromName: msg.fromName,
      text: msg.text,
      html: msg.html,
      tags: [{ name: "tipo", value: `area_quiz_recupera_${etapa}` }],
    });
    if (envio.ok) {
      r.enviados++;
      continue;
    }
    r.falhas++;
    const { error: erroVolta } = await admin
      .from("area_quiz_visitas")
      .update({ recuperacoes: v.recuperacoes, recuperacao_em: v.recuperacao_em })
      .eq("id", v.id);
    if (erroVolta) throw new Error(erroVolta.message);
  }
  return r;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A visita do link, conferida pela chave e pela empresa. `null` quando o link não vale. */
async function visitaDoLink(
  admin: SupabaseClient,
  organizationId: string,
  id: string | undefined,
  chave: string | undefined,
): Promise<{ quiz: Quiz; contact_id: string | null; dados: unknown } | null> {
  if (!id || !chave || !UUID.test(id) || !UUID.test(chave)) return null;
  const { data, error } = await admin
    .from("area_quiz_visitas")
    .select("quiz, contact_id, dados")
    .eq("organization_id", organizationId)
    .eq("id", id)
    .eq("recuperacao_chave", chave)
    .maybeSingle();
  if (error || !data) return null;
  return data as { quiz: Quiz; contact_id: string | null; dados: unknown };
}

/** Os dados para a página reabrir a prévia, só se o link for desta empresa e deste quiz. */
export async function dadosDaRetomada(
  admin: SupabaseClient,
  organizationId: string,
  quiz: Quiz,
  id: string | undefined,
  chave: string | undefined,
): Promise<DadosDaRetomada | null> {
  const v = await visitaDoLink(admin, organizationId, id, chave);
  if (!v || v.quiz !== quiz) return null;
  const lido = dadosDaRetomadaSchema.safeParse(v.dados);
  return lido.success ? lido.data : null;
}

/** "Não quero mais e-mails": grava a recusa no contato, a mesma que campanhas e automações já respeitam. */
export async function sairDosEmails(admin: SupabaseClient, organizationId: string, id: string | undefined, chave: string | undefined, agora: Date): Promise<boolean> {
  const v = await visitaDoLink(admin, organizationId, id, chave);
  if (!v?.contact_id) return false;
  const { data: c, error } = await admin.from("contacts").select("consent").eq("organization_id", organizationId).eq("id", v.contact_id).maybeSingle();
  if (error || !c) return false;
  const consent = ((c as { consent: Record<string, unknown> | null }).consent ?? {}) as Record<string, unknown>;
  const marketing = (consent.marketing ?? {}) as Record<string, unknown>;
  if (marketing.declined_at) return true;
  const { error: erro } = await admin
    .from("contacts")
    .update({ consent: { ...consent, marketing: { ...marketing, declined_at: agora.toISOString(), declined_source: "email_do_quiz" } } })
    .eq("organization_id", organizationId)
    .eq("id", v.contact_id);
  return !erro;
}
