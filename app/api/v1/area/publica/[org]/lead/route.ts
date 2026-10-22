/**
 * POST /api/v1/area/publica/[org]/lead — quem dá o e-mail para ver a prévia de um quiz vira contato na hora
 * (`lib/area-do-cliente/lead-do-quiz.ts`), e a visita do funil passa a saber quem é.
 *
 * O contato é o do e-mail, ou um novo (origem "quiz", com o quiz, a campanha e as respostas). Contato que já
 * existe NÃO é alterado: o e-mail de um formulário público não reescreve nome nem nascimento de ninguém.
 * Responde 204: a prévia não espera por isto, e uma falha aqui não pode travar o quiz.
 */
import { NextResponse, type NextRequest } from "next/server";

import { ligarVisitaAoContato } from "@/lib/area-do-cliente/funil-dos-quizzes";
import { NAO_ENCONTRADA, contextoDaArea, dentroDoLimite } from "@/lib/area-do-cliente/http";
import { leadDoQuizSchema, origemDoLead } from "@/lib/area-do-cliente/lead-do-quiz";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  if (!(await dentroDoLimite(req, "quiz-lead", 10, 600))) return new NextResponse(null, { status: 429 });
  const lido = leadDoQuizSchema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return NextResponse.json({ error: { code: "validation_failed", message: "Confira o nome e o e-mail." } }, { status: 422 });
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org } = ctx;
  const l = lido.data;

  try {
    const { data: existente, error: erroLeitura } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", org.id)
      .eq("email_normalized", l.email)
      .is("is_merged_into", null)
      .maybeSingle();
    if (erroLeitura) throw new Error(erroLeitura.message);
    let contactId = (existente as { id: string } | null)?.id ?? null;
    if (!contactId) {
      const { data: novo, error } = await admin
        .from("contacts")
        .insert({
          organization_id: org.id,
          name: l.nome,
          email: l.email,
          ...(l.nascimento ? { birthdate: l.nascimento } : {}),
          source: "site",
          source_metadata: origemDoLead(l),
        })
        .select("id")
        .single();
      if (error || !novo) throw new Error(error?.message ?? "contato não criado");
      contactId = (novo as { id: string }).id;
    }
    await ligarVisitaAoContato(admin, { organizationId: org.id, visita: l.visita, quiz: l.quiz, contactId });
  } catch (err) {
    logger.warn("[area.quiz.lead] não gravado", {
      organization_id: org.id,
      quiz: l.quiz,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return new NextResponse(null, { status: 204 });
}
