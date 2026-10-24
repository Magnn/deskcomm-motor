/**
 * A LEITURA do funil dos quizzes da página (migration 0944) para a tela da equipe.
 *
 * Conta com `count: exact, head: true` — nunca baixa as linhas: o PostgREST corta respostas em 1.000 linhas, e
 * uma contagem por download ficaria errada em silêncio assim que o quiz tivesse mais visitas que isso.
 * 4 quizzes × 9 passos = 36 contagens, em paralelo; por campanha, 4 passos-chave para as campanhas que trouxeram
 * gente no período. As páginas de vendas (0947, `quiz = 'pagina'`) entram à parte: um funil por slug e uma linha
 * por anúncio (`utm_content`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { FUNIL_DA_PAGINA, FUNIL_DO_QUIZ, QUIZZES, funilDoQuiz, maiorPerda, type LinhaDoFunil, type PassoDoQuiz, type QuizDaPagina } from "./passos-do-quiz";

/** Os passos que a tela mostra por campanha: entrou, viu a prévia, foi pagar, pagou. */
const PASSOS_DA_CAMPANHA = ["abriu", "previa", "cobranca", "pago"] as const satisfies readonly PassoDoQuiz[];

export interface FunilDeUmQuiz {
  quiz: QuizDaPagina;
  funil: LinhaDoFunil[];
  maiorPerda: ReturnType<typeof maiorPerda>;
  celular: { abriu: number; pago: number };
}

export interface FunilDeUmaPagina {
  pagina: string;
  funil: LinhaDoFunil[];
  maiorPerda: ReturnType<typeof maiorPerda>;
  /** Chamaram no WhatsApp (desvio, fora do funil). */
  whatsapp: number;
  celular: { abriu: number; pago: number };
}

/** Uma linha por anúncio de uma página: de onde veio a visita e até onde ela foi. */
export interface AnuncioDaPagina {
  pagina: string;
  campanha: string;
  anuncio: string;
  abriu: number;
  oferta: number;
  comprar: number;
  whatsapp: number;
  pago: number;
}

export interface CampanhaDoQuiz {
  campanha: string;
  quiz: QuizDaPagina;
  abriu: number;
  previa: number;
  cobranca: number;
  pago: number;
}

async function contar(
  db: SupabaseClient,
  orgId: string,
  desde: string,
  filtro: { quiz: QuizDaPagina; passo: PassoDoQuiz; pagina?: string; campanha?: string | null; anuncio?: string | null; celular?: boolean },
): Promise<number> {
  let q = db
    .from("area_quiz_passos")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", desde)
    .eq("quiz", filtro.quiz)
    .eq("passo", filtro.passo);
  if (filtro.pagina !== undefined) q = q.eq("pagina", filtro.pagina);
  if (filtro.campanha !== undefined) q = filtro.campanha === null ? q.is("campanha", null) : q.eq("campanha", filtro.campanha);
  if (filtro.anuncio !== undefined) q = filtro.anuncio === null ? q.is("anuncio", null) : q.eq("anuncio", filtro.anuncio);
  if (filtro.celular !== undefined) q = q.eq("celular", filtro.celular);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function lerFunilDosQuizzes(
  db: SupabaseClient,
  orgId: string,
  desde: Date,
): Promise<{ quizzes: FunilDeUmQuiz[]; campanhas: CampanhaDoQuiz[]; paginas: FunilDeUmaPagina[]; anuncios: AnuncioDaPagina[] }> {
  const iso = desde.toISOString();

  const quizzes = await Promise.all(
    QUIZZES.map(async (quiz) => {
      const contagens = Object.fromEntries(
        await Promise.all(FUNIL_DO_QUIZ.map(async (passo) => [passo, await contar(db, orgId, iso, { quiz, passo })] as const)),
      ) as Record<PassoDoQuiz, number>;
      const [abriuCel, pagoCel] = await Promise.all([
        contar(db, orgId, iso, { quiz, passo: "abriu", celular: true }),
        contar(db, orgId, iso, { quiz, passo: "pago", celular: true }),
      ]);
      const funil = funilDoQuiz(quiz, contagens);
      return { quiz, funil, maiorPerda: maiorPerda(funil), celular: { abriu: abriuCel, pago: pagoCel } };
    }),
  );

  // As campanhas que trouxeram alguém no período (lidas de `abriu`, até 1.000 visitas — o bastante para LISTAR os
  // nomes; as contagens abaixo são exatas).
  const { data: chegadas, error } = await db
    .from("area_quiz_passos")
    .select("quiz, campanha")
    .eq("organization_id", orgId)
    .gte("created_at", iso)
    .eq("passo", "abriu")
    .in("quiz", [...QUIZZES])
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const pares = new Map<string, { quiz: QuizDaPagina; campanha: string | null }>();
  for (const c of (chegadas ?? []) as Array<{ quiz: QuizDaPagina; campanha: string | null }>) pares.set(`${c.quiz}|${c.campanha ?? ""}`, c);
  const campanhas = await Promise.all(
    [...pares.values()].slice(0, 30).map(async ({ quiz, campanha }) => {
      const [abriu, previa, cobranca, pago] = await Promise.all(
        PASSOS_DA_CAMPANHA.map((passo) => contar(db, orgId, iso, { quiz, passo, campanha })),
      );
      return { campanha: campanha ?? "(sem campanha)", quiz, abriu: abriu!, previa: previa!, cobranca: cobranca!, pago: pago! };
    }),
  );
  campanhas.sort((a, b) => b.abriu - a.abriu);
  const { paginas, anuncios } = await lerFunilDasPaginas(db, orgId, iso);
  return { quizzes, campanhas, paginas, anuncios };
}

/** As páginas de vendas: as que tiveram visita no período, cada uma com o seu funil e os seus anúncios. */
async function lerFunilDasPaginas(db: SupabaseClient, orgId: string, iso: string): Promise<{ paginas: FunilDeUmaPagina[]; anuncios: AnuncioDaPagina[] }> {
  const quiz = "pagina" as const;
  const { data, error } = await db
    .from("area_quiz_passos")
    .select("pagina, campanha, anuncio")
    .eq("organization_id", orgId)
    .gte("created_at", iso)
    .eq("quiz", quiz)
    .eq("passo", "abriu")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  const chegadas = ((data ?? []) as Array<{ pagina: string | null; campanha: string | null; anuncio: string | null }>).filter(
    (c): c is { pagina: string; campanha: string | null; anuncio: string | null } => c.pagina !== null,
  );

  const paginas = await Promise.all(
    [...new Set(chegadas.map((c) => c.pagina))].slice(0, 10).map(async (pagina) => {
      const contagens = Object.fromEntries(
        await Promise.all(FUNIL_DA_PAGINA.map(async (passo) => [passo, await contar(db, orgId, iso, { quiz, pagina, passo })] as const)),
      ) as Partial<Record<PassoDoQuiz, number>>;
      const [whatsapp, abriuCel, pagoCel] = await Promise.all([
        contar(db, orgId, iso, { quiz, pagina, passo: "whatsapp" }),
        contar(db, orgId, iso, { quiz, pagina, passo: "abriu", celular: true }),
        contar(db, orgId, iso, { quiz, pagina, passo: "pago", celular: true }),
      ]);
      const funil = funilDoQuiz(quiz, contagens);
      return { pagina, funil, maiorPerda: maiorPerda(funil), whatsapp, celular: { abriu: abriuCel, pago: pagoCel } };
    }),
  );

  const pares = new Map<string, { pagina: string; campanha: string | null; anuncio: string | null }>();
  for (const c of chegadas) pares.set(`${c.pagina}|${c.campanha ?? ""}|${c.anuncio ?? ""}`, c);
  const anuncios = await Promise.all(
    [...pares.values()].slice(0, 30).map(async ({ pagina, campanha, anuncio }) => {
      const [abriu, oferta, comprar, whatsapp, pago] = await Promise.all(
        (["abriu", "oferta", "comprar", "whatsapp", "pago"] as const).map((passo) => contar(db, orgId, iso, { quiz, pagina, passo, campanha, anuncio })),
      );
      return {
        pagina,
        campanha: campanha ?? "(sem campanha)",
        anuncio: anuncio ?? "(sem anúncio)",
        abriu: abriu!,
        oferta: oferta!,
        comprar: comprar!,
        whatsapp: whatsapp!,
        pago: pago!,
      };
    }),
  );
  anuncios.sort((a, b) => b.abriu - a.abriu);
  return { paginas, anuncios };
}

/**
 * Liga a visita anônima ao contato no pedido de pagamento — é o que faz o painel ao vivo mostrar QUEM está
 * parado no pagamento. Nunca lança: o pedido não pode falhar por causa da medição.
 */
export async function ligarVisitaAoContato(
  admin: SupabaseClient,
  d: { organizationId: string; visita: string | undefined; quiz: QuizDaPagina; contactId: string },
): Promise<void> {
  if (!d.visita) return;
  try {
    await admin
      .from("area_quiz_visitas")
      .update({ contact_id: d.contactId })
      .eq("organization_id", d.organizationId)
      .eq("visita", d.visita)
      .eq("quiz", d.quiz);
  } catch {
    /* medição nunca derruba o pedido */
  }
}
