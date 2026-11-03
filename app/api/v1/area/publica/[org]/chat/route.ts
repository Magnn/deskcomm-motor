/**
 * /api/v1/area/publica/[org]/chat — o chat da área com a empresa (`lib/area-do-cliente/chat.ts`).
 *
 * GET  — a conversa inteira do contato (WhatsApp e área juntos) e se a empresa está escrevendo agora.
 *        Com `?visto=1` (a tela está à vista), as respostas ficam lidas e a presença dela é renovada.
 * POST — `{ texto }`: a mensagem entra na conversa do Desk como qualquer mensagem dela, e o agente responde.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { empresaDigitando, lerChat, marcarChatVisto, receberDaArea } from "@/lib/area-do-cliente/chat";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ texto: z.string().trim().min(1).max(4000) });
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });
const SEM_CACHE = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (req.nextUrl.searchParams.get("visto") === "1") await marcarChatVisto(admin, org.id, sessao.contactId, sessao.sessaoId);
  const [mensagens, digitando] = await Promise.all([lerChat(admin, org.id, sessao.contactId), empresaDigitando(admin, org.id, sessao.contactId)]);
  return NextResponse.json({ data: { mensagens, digitando } }, { headers: SEM_CACHE });
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:chat:${sessao.contactId}`, 40, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas mensagens seguidas. Espere um pouquinho.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escreva a sua mensagem (até 4.000 caracteres).");
  const r = await receberDaArea(admin, { orgId: org.id, contactId: sessao.contactId, nome: null, conteudo: { tipo: "texto", texto: lido.data.texto } });
  if (!r.ok) {
    return r.motivo === "sem_conversa"
      ? ERRO(409, "sem_conversa", "O chat ainda não está disponível. Tente de novo mais tarde.")
      : ERRO(500, "internal_error", "Não foi possível enviar agora. Tente de novo.");
  }
  await marcarChatVisto(admin, org.id, sessao.contactId, sessao.sessaoId);
  return NextResponse.json({ data: r.mensagem }, { headers: SEM_CACHE });
}
