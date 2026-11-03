/**
 * POST /api/v1/area/publica/[org]/mao/[id]/voz — ouvir a leitura da mão PAGA (`lib/area-do-cliente/narracao.ts`).
 * A sessão da área é o direito; a leitura grátis (só a linha do coração) não é narrada.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { NOME_DA_LINHA } from "@/lib/area-do-cliente/mao";
import { umaMao } from "@/lib/area-do-cliente/mao-servidor";
import { narrarTextoLongo } from "@/lib/area-do-cliente/narracao";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ org: string; id: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:mao-voz:${sessao.contactId}`, 12, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Espere alguns minutos para ouvir de novo.");

  const mao = await umaMao(admin, org.id, sessao.contactId, id);
  if (!mao?.paga || !mao.sintese) return NAO_ENCONTRADA();
  const texto = [
    "A leitura da sua mão.",
    ...mao.linhas.filter((l) => l.leitura).map((l) => `${NOME_DA_LINHA[l.linha]}.\n${l.leitura}`),
    `O que a sua mão diz junta.\n${mao.sintese}`,
    ...(mao.passo ? [`Um passo para agora.\n${mao.passo}`] : []),
  ].join("\n\n");

  const r = await narrarTextoLongo(admin, org.id, `${org.id}/mao/narracoes/${id}.mp3`, texto);
  if (!r.ok) return ERRO(503, r.motivo, "A voz não está disponível agora. A leitura escrita continua aqui.");
  return NextResponse.json({ data: { url: r.url } }, { headers: { "Cache-Control": "no-store" } });
}
