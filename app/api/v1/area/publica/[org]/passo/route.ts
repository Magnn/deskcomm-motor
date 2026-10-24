/**
 * POST /api/v1/area/publica/[org]/passo — um passo do funil de um quiz da página, ou o sinal de "ainda estou
 * aqui" (migration 0944).
 *
 * Público e anônimo: quem faz o quiz não tem contato nem sessão até pedir o pagamento. A página manda o id da
 * VISITA (UUID gerado no navegador) e o quiz; com `passo`, é um passo do funil; sem, é o sinal que mantém a
 * visita "ao vivo" (a página manda a cada ~20 s enquanto está visível).
 *
 * - `area_quiz_visitas`: a visita nasce no primeiro sinal; `visto_em` é renovado a cada um; o passo só AVANÇA.
 * - `area_quiz_passos`: uma linha por passo, e a repetição é ignorada.
 * - A página de vendas (0947) usa a mesma rota com `quiz: "pagina"` e o slug em `pagina`; o `whatsapp` dela é
 *   gravado como passo mas não avança a visita.
 *
 * Responde 204 sempre que a forma é válida: a página nunca espera nem mostra erro por causa da medição, e um
 * passo perdido não pode travar a venda.
 */
import { NextResponse, type NextRequest } from "next/server";

import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { ordemDoPasso, passoDoQuizSchema, regiaoPeloFuso } from "@/lib/area-do-cliente/passos-do-quiz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  // Folgado: o sinal sai a cada 20 s por pessoa, e uma rede de celular inteira sai por um IP só.
  if (!(await dentroDoLimite(req, "quiz-passo", 300))) return new NextResponse(null, { status: 429 });
  const lido = passoDoQuizSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Passo inválido." } }, { status: 422 });
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const p = lido.data;
  const agora = new Date().toISOString();

  try {
    const { data: atual, error: erroLeitura } = await admin
      .from("area_quiz_visitas")
      .select("id, passo_ordem")
      .eq("organization_id", org.id)
      .eq("visita", p.visita)
      .eq("quiz", p.quiz)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    const passo = p.passo ?? "abriu";
    const ordem = ordemDoPasso(passo, p.quiz);
    const pagina = p.pagina ?? null;
    const anuncio = p.anuncio ?? null;
    if (!atual) {
      const { error } = await admin.from("area_quiz_visitas").upsert(
        {
          organization_id: org.id,
          visita: p.visita,
          quiz: p.quiz,
          passo,
          passo_ordem: ordem ?? 0,
          pagina,
          anuncio,
          fuso: p.fuso ?? null,
          regiao: regiaoPeloFuso(p.fuso),
          idioma: p.idioma ?? null,
          campanha: p.campanha ?? null,
          origem: p.origem ?? null,
          moeda: p.moeda ?? null,
          celular: p.celular ?? null,
          visto_em: agora,
        },
        { onConflict: "organization_id,visita,quiz", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    } else {
      const avanca = p.passo !== undefined && ordem !== null && ordem > (atual as { passo_ordem: number }).passo_ordem;
      const { error } = await admin
        .from("area_quiz_visitas")
        .update({ visto_em: agora, ...(avanca ? { passo, passo_ordem: ordem } : {}), ...(p.moeda ? { moeda: p.moeda } : {}) })
        .eq("id", (atual as { id: string }).id);
      if (error) throw new Error(error.message);
    }
    if (p.passo) {
      const { error } = await admin.from("area_quiz_passos").upsert(
        {
          organization_id: org.id,
          visita: p.visita,
          quiz: p.quiz,
          passo: p.passo,
          pagina,
          anuncio,
          campanha: p.campanha ?? null,
          origem: p.origem ?? null,
          moeda: p.moeda ?? null,
          celular: p.celular ?? null,
        },
        { onConflict: "organization_id,visita,quiz,passo", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    logger.warn("[area.quiz.passo] não gravado", {
      organization_id: org.id,
      quiz: p.quiz,
      passo: p.passo ?? "sinal",
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return new NextResponse(null, { status: 204 });
}
