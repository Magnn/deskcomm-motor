/**
 * /api/v1/area/publica/[org]/mensagens — o "Fale com a gente" de dentro da área.
 *
 * GET  — a conversa da pessoa com a equipe (a área consulta de tempos em tempos
 *        enquanto está aberta) e marca as respostas da equipe como lidas.
 * POST — `{ texto }`: a pessoa escreve; a mensagem aparece para a equipe em
 *        CRM › Área do cliente › Mensagens.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ texto: z.string().trim().min(1).max(2000) });
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const { data } = await admin
    .from("area_mensagens")
    .select("id, autor, texto, created_at")
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .order("created_at", { ascending: true })
    .limit(200);
  await admin
    .from("area_mensagens")
    .update({ lida_pelo_cliente_at: new Date().toISOString() })
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("autor", "equipe")
    .is("lida_pelo_cliente_at", null);
  const mensagens = ((data ?? []) as Array<{ id: string; autor: string; texto: string; created_at: string }>).map((m) => ({
    id: m.id,
    autor: m.autor,
    texto: m.texto,
    quando: m.created_at,
  }));
  return NextResponse.json({ data: mensagens }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:mensagens:${sessao.contactId}`, 20, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas mensagens seguidas. Espere um pouco: a gente já vai responder.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escreva a sua mensagem (até 2.000 caracteres).");
  const { data, error } = await admin
    .from("area_mensagens")
    .insert({ organization_id: org.id, contact_id: sessao.contactId, autor: "cliente", texto: lido.data.texto })
    .select("id, autor, texto, created_at")
    .single();
  if (error || !data) return ERRO(500, "internal_error", "Não foi possível enviar agora. Tente de novo.");
  const m = data as { id: string; autor: string; texto: string; created_at: string };
  return NextResponse.json(
    { data: { id: m.id, autor: m.autor, texto: m.texto, quando: m.created_at } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
