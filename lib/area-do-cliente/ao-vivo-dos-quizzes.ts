/**
 * O PAINEL AO VIVO dos quizzes da página (migration 0944): quem está na página agora, em que passo, de onde,
 * em que aparelho e de qual campanha; quem pediu o pagamento e não pagou (com nome e e-mail — os leads mais
 * quentes para recuperar); de onde vêm as visitas; a que horas mais gente abre; e quanto tempo leva até a prévia.
 *
 * "Ao vivo" = sinal nos últimos 60 s (a página manda um a cada ~20 s com a aba visível). A identidade só existe
 * a partir do pedido de pagamento, quando a pessoa deu o e-mail: antes disso a visita é anônima, e o que ela
 * digitou e não enviou não é guardado.
 *
 * As listas leem no máximo 1.000 linhas (corte do PostgREST); quando o período passa disso, `truncado` avisa.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

import type { PassoDoQuiz, QuizDaPagina } from "./passos-do-quiz";

const JANELA_AO_VIVO_MS = 60_000;
const LIMITE = 1000;

export interface VisitaAoVivo {
  quiz: QuizDaPagina;
  passo: PassoDoQuiz;
  regiao: string | null;
  celular: boolean | null;
  campanha: string | null;
  moeda: string | null;
  naPaginaHaS: number;
  pessoa: { nome: string | null; email: string | null } | null;
}

export interface ParadoNoPagamento {
  quiz: QuizDaPagina;
  passo: PassoDoQuiz;
  nome: string | null;
  email: string | null;
  regiao: string | null;
  campanha: string | null;
  vistoEm: string;
  contactId: string;
}

export interface AoVivoDosQuizzes {
  agora: number;
  visitas: VisitaAoVivo[];
  parados: ParadoNoPagamento[];
  regioes: Array<{ regiao: string; visitas: number; pagaram: number }>;
  horas: number[];
  minutosAtePrevia: number | null;
  truncado: boolean;
}

type Linha = {
  visita: string;
  quiz: QuizDaPagina;
  passo: PassoDoQuiz;
  regiao: string | null;
  celular: boolean | null;
  campanha: string | null;
  moeda: string | null;
  contact_id: string | null;
  primeiro_em: string;
  visto_em: string;
};

type Marca = { visita: string; quiz: string; created_at: string };

async function pessoas(db: SupabaseClient, orgId: string, ids: string[]): Promise<Map<string, { nome: string | null; email: string | null }>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data, error } = await db.from("contacts").select("id, name, display_name, email").eq("organization_id", orgId).in("id", unicos);
  if (error) throw new Error(error.message);
  return new Map(
    ((data ?? []) as Array<{ id: string; name: string | null; display_name: string | null; email: string | null }>).map((c) => [
      c.id,
      { nome: nomeDoContato(c), email: c.email },
    ]),
  );
}

/** Quem já tem pedido pago (quiz ou sinastria) desde `desde` — sai da lista dos parados. */
async function jaPagaram(db: SupabaseClient, orgId: string, ids: string[], desde: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const [a, b] = await Promise.all([
    db.from("area_quiz_pedidos").select("contact_id").eq("organization_id", orgId).in("contact_id", ids).not("pago_at", "is", null).gte("created_at", desde),
    db.from("area_sinastrias").select("contact_id").eq("organization_id", orgId).in("contact_id", ids).not("pago_at", "is", null).gte("created_at", desde),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (b.error) throw new Error(b.error.message);
  return new Set([...(a.data ?? []), ...(b.data ?? [])].map((r) => (r as { contact_id: string }).contact_id));
}

/** A hora local (0–23) de um instante no fuso da organização. */
export function horaNoFuso(iso: string, fuso: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: fuso, hour: "numeric", hourCycle: "h23" }).format(new Date(iso));
  return Number(h) % 24;
}

/** Mediana, em minutos, entre abrir e ver a prévia na MESMA visita; ignora o que passa de 3 h (voltou outro dia). */
export function medianaAtePrevia(aberturas: readonly Marca[], previas: readonly Marca[]): number | null {
  const abriuEm = new Map(aberturas.map((a) => [`${a.visita}|${a.quiz}`, Date.parse(a.created_at)]));
  const tempos = previas
    .map((p) => {
      const inicio = abriuEm.get(`${p.visita}|${p.quiz}`);
      return inicio === undefined ? null : (Date.parse(p.created_at) - inicio) / 60_000;
    })
    .filter((m): m is number => m !== null && m >= 0 && m < 180)
    .sort((a, b) => a - b);
  return tempos.length === 0 ? null : Math.round(tempos[Math.floor(tempos.length / 2)]! * 10) / 10;
}

export async function lerAoVivo(db: SupabaseClient, orgId: string, desde: Date, fuso: string): Promise<AoVivoDosQuizzes> {
  const agoraMs = Date.now();
  const desdeIso = desde.toISOString();
  const colunas = "visita, quiz, passo, regiao, celular, campanha, moeda, contact_id, primeiro_em, visto_em";

  const [vivas, periodo, aberturas, previas] = await Promise.all([
    db
      .from("area_quiz_visitas")
      .select(colunas)
      .eq("organization_id", orgId)
      .gte("visto_em", new Date(agoraMs - JANELA_AO_VIVO_MS).toISOString())
      .order("visto_em", { ascending: false })
      .limit(200),
    db.from("area_quiz_visitas").select(colunas).eq("organization_id", orgId).gte("visto_em", desdeIso).order("visto_em", { ascending: false }).limit(LIMITE),
    db.from("area_quiz_passos").select("visita, quiz, created_at").eq("organization_id", orgId).eq("passo", "abriu").gte("created_at", desdeIso).limit(LIMITE),
    db.from("area_quiz_passos").select("visita, quiz, created_at").eq("organization_id", orgId).eq("passo", "previa").gte("created_at", desdeIso).limit(LIMITE),
  ]);
  for (const r of [vivas, periodo, aberturas, previas]) if (r.error) throw new Error(r.error.message);
  const agoraLinhas = (vivas.data ?? []) as Linha[];
  const doPeriodo = (periodo.data ?? []) as Linha[];
  const abriram = (aberturas.data ?? []) as Marca[];

  // Parados no pagamento: pediram (cartão aberto ou Pix na tela) e não há pagamento.
  const candidatos = doPeriodo.filter((v) => (v.passo === "pagar" || v.passo === "cobranca") && v.contact_id);
  const ids = candidatos.map((v) => v.contact_id!);
  const [quem, pagos] = await Promise.all([
    pessoas(db, orgId, [...ids, ...agoraLinhas.flatMap((v) => (v.contact_id ? [v.contact_id] : []))]),
    jaPagaram(db, orgId, ids, desdeIso),
  ]);
  const vistos = new Set<string>();
  const parados: ParadoNoPagamento[] = [];
  for (const v of candidatos) {
    const id = v.contact_id!;
    if (pagos.has(id) || vistos.has(`${id}|${v.quiz}`)) continue;
    vistos.add(`${id}|${v.quiz}`);
    const p = quem.get(id);
    parados.push({ quiz: v.quiz, passo: v.passo, nome: p?.nome ?? null, email: p?.email ?? null, regiao: v.regiao, campanha: v.campanha, vistoEm: v.visto_em, contactId: id });
  }

  // De onde vêm (no período) e quantos de cada região pagaram.
  const porRegiao = new Map<string, { visitas: number; pagaram: number }>();
  for (const v of doPeriodo) {
    const r = v.regiao ?? "(sem fuso)";
    const atual = porRegiao.get(r) ?? { visitas: 0, pagaram: 0 };
    atual.visitas += 1;
    if (v.passo === "pago" || v.passo === "leitura") atual.pagaram += 1;
    porRegiao.set(r, atual);
  }

  // A que horas (no fuso da organização) as pessoas abrem.
  const horas = Array.from({ length: 24 }, () => 0);
  for (const a of abriram) horas[horaNoFuso(a.created_at, fuso)]! += 1;

  return {
    agora: agoraLinhas.length,
    visitas: agoraLinhas.map((v) => ({
      quiz: v.quiz,
      passo: v.passo,
      regiao: v.regiao,
      celular: v.celular,
      campanha: v.campanha,
      moeda: v.moeda,
      naPaginaHaS: Math.max(0, Math.round((agoraMs - Date.parse(v.primeiro_em)) / 1000)),
      pessoa: v.contact_id ? (quem.get(v.contact_id) ?? null) : null,
    })),
    parados: parados.slice(0, 50),
    regioes: [...porRegiao.entries()].map(([regiao, n]) => ({ regiao, ...n })).sort((a, b) => b.visitas - a.visitas),
    horas,
    minutosAtePrevia: medianaAtePrevia(abriram, (previas.data ?? []) as Marca[]),
    truncado: doPeriodo.length >= LIMITE || abriram.length >= LIMITE,
  };
}
