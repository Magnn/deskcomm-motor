/**
 * POST /api/v1/area/publica/[org]/leituras/[id]/voz — a leitura narrada (mp3) pela voz do próprio servidor.
 *
 * Devolve um link assinado do áudio. A primeira chamada gera e guarda (pode levar até um minuto numa leitura
 * longa); as seguintes devolvem o mesmo arquivo. Só com a narração ligada na área.
 *
 * Com a voz HUMANA (`narrar_com: "humana"`), a leitura entra numa fila: a resposta é 202 com o lugar na
 * fila até ficar pronta, e a tela pergunta de novo.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { narrarLeitura } from "@/lib/area-do-cliente/leituras-voz";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; id: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  if (!org.config.leituras?.narrar) return NAO_ENCONTRADA();

  const limite = await checkRateLimit(`area:leitura-voz:${sessao.contactId}`, 12, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Espere alguns minutos para ouvir de novo.");

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await narrarLeitura(
    admin,
    org.id,
    sessao.contactId,
    id,
    primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
    { humana: org.config.leituras?.narrar_com === "humana" ? { voz: org.config.leituras.voz_humana } : null },
  );
  if (!r.ok && r.motivo === "preparando") {
    return NextResponse.json({ data: { preparando: true, posicao: r.posicao } }, { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  if (!r.ok) {
    if (r.motivo === "nao_encontrada") return NAO_ENCONTRADA();
    return ERRO(503, r.motivo, "A voz não está disponível agora. A leitura escrita continua aqui.");
  }
  return NextResponse.json({ data: { url: r.url } }, { headers: { "Cache-Control": "no-store" } });
}
