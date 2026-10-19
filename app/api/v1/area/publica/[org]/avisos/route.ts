/**
 * /api/v1/area/publica/[org]/avisos — o aviso diário no celular de quem está na área.
 *
 * GET: a chave pública (VAPID) para o navegador criar a inscrição, e se os avisos estão ligados na empresa.
 * POST `{ endpoint, keys: { p256dh, auth } }`: guarda a inscrição deste aparelho.
 * DELETE `{ endpoint }`: desliga o aviso neste aparelho.
 *
 * Quem manda o aviso é o cron `area-avisos`, um por dia, na hora da empresa.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { configDosAvisos } from "@/lib/area-do-cliente/avisos";
import { apagarInscricao, guardarInscricao } from "@/lib/area-do-cliente/avisos-servidor";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { logger } from "@/lib/logger";
import { vapidPronto, vapidPublica } from "@/lib/notifications/vapid";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const endpoint = z.string().url().max(1000).refine((u) => u.startsWith("https://"), "https");
const inscricao = z.object({
  endpoint,
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

async function preparar(req: NextRequest, slug: string) {
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return { resposta: NAO_ENCONTRADA() } as const;
  if (!ctx.sessao) return { resposta: ERRO(401, "unauthenticated", "Entre na sua área.") } as const;
  if (!configDosAvisos(ctx.org.config.avisos).ativo || !vapidPronto()) {
    return { resposta: ERRO(404, "not_found", "Os avisos não estão disponíveis.") } as const;
  }
  return { ctx: { ...ctx, sessao: ctx.sessao } } as const;
}

export async function GET(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const p = await preparar(req, slug);
  if (p.resposta) return p.resposta;
  return NextResponse.json(
    { data: { chave: vapidPublica(), hora: configDosAvisos(p.ctx.org.config.avisos).hora } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const p = await preparar(req, slug);
  if (p.resposta) return p.resposta;
  const { admin, org, sessao } = p.ctx;
  const limite = await checkRateLimit(`area:avisos:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = inscricao.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Inscrição inválida.");
  try {
    await guardarInscricao(admin, org.id, sessao.contactId, lido.data);
  } catch (err) {
    logger.error("[area.avisos] inscrição não guardada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(500, "internal_error", "Não foi possível ligar o aviso agora.");
  }
  await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "aviso_ligado", sessaoId: sessao.sessaoId });
  return NextResponse.json({ data: { ligado: true } }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const lido = z.object({ endpoint }).safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Inscrição inválida.");
  await apagarInscricao(admin, org.id, sessao.contactId, lido.data.endpoint);
  await registrarEvento(admin, { organizationId: org.id, contactId: sessao.contactId, tipo: "aviso_desligado", sessaoId: sessao.sessaoId });
  return NextResponse.json({ data: { ligado: false } }, { headers: { "Cache-Control": "no-store" } });
}
