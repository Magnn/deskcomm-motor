/**
 * POST /api/v1/area/publica/[org]/chat/arquivo — áudio gravado ou foto mandados pelo chat da área.
 *
 * Corpo `multipart/form-data` com `arquivo` (e `legenda`, opcional, para foto). O arquivo vai para o
 * bucket da conversa e a mensagem entra como as outras (`receberDaArea`): o áudio é transcrito antes de
 * o agente responder, igual ao que chega pelo WhatsApp.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { TETO_DO_ARQUIVO_BYTES, marcarChatVisto, receberDaArea, tipoDoArquivo } from "@/lib/area-do-cliente/chat";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:chat-arquivo:${sessao.contactId}`, 20, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitos arquivos seguidos. Espere um pouquinho.");
  const form = await req.formData().catch(() => null);
  const arquivo = form?.get("arquivo");
  if (!(arquivo instanceof Blob) || !tipoDoArquivo(arquivo.type) || arquivo.size > TETO_DO_ARQUIVO_BYTES) {
    return ERRO(422, "arquivo_recusado", "Mande um áudio ou uma foto de até 16 MB.");
  }
  const legenda = form?.get("legenda");
  const r = await receberDaArea(admin, {
    orgId: org.id,
    contactId: sessao.contactId,
    nome: null,
    conteudo: {
      tipo: "arquivo",
      bytes: new Uint8Array(await arquivo.arrayBuffer()),
      mime: arquivo.type,
      legenda: typeof legenda === "string" && legenda.trim() !== "" ? legenda.trim().slice(0, 1000) : null,
    },
  });
  if (!r.ok) {
    return r.motivo === "sem_conversa"
      ? ERRO(409, "sem_conversa", "Ainda não há uma conversa sua com a gente. Fale pelo WhatsApp primeiro.")
      : r.motivo === "arquivo_recusado"
        ? ERRO(422, "arquivo_recusado", "Mande um áudio ou uma foto de até 16 MB.")
        : ERRO(500, "internal_error", "Não foi possível enviar agora. Tente de novo.");
  }
  await marcarChatVisto(admin, org.id, sessao.contactId, sessao.sessaoId);
  return NextResponse.json({ data: r.mensagem }, { headers: { "Cache-Control": "no-store" } });
}
