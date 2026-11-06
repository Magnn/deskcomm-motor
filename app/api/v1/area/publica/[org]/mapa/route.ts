/**
 * POST /api/v1/area/publica/[org]/mapa — o mapa natal completo (`lib/relatorio/mapa-natal.ts`): os dez planetas, o
 * Ascendente, o Meio do Céu e as casas, com a data, a hora e a cidade do nascimento.
 *
 * Corpo `{ data, hora, cidade_id }`; `hora: null` = não sabe a hora (planetas do meio-dia, sem Ascendente nem casas).
 * A cidade vem pelo id da busca (`mapa/cidades`): coordenadas e fuso saem da lista do servidor, nunca do navegador.
 * Só calcula, não grava nada: a data de nascimento do cadastro continua vindo da entrada da área.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { dataDeNascimentoValida } from "@/lib/area-do-cliente/aniversario";
import { cidadePorId } from "@/lib/area-do-cliente/cidades";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { calcularMapaNatal } from "@/lib/relatorio/mapa-natal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hora: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
  cidade_id: z.number().int().positive(),
});
type Ctx = { params: Promise<{ org: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  if (!ctx.sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const limite = await checkRateLimit(`area:mapa:${ctx.sessao.contactId}`, 30, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success || !dataDeNascimentoValida(lido.data.data)) return ERRO(422, "validation_failed", "Confira a data e a hora.");
  const cidade = await cidadePorId(lido.data.cidade_id);
  if (!cidade) return ERRO(422, "validation_failed", "Escolha a cidade na lista.");
  const mapa = calcularMapaNatal({ data: lido.data.data, hora: lido.data.hora, latitude: cidade.latitude, longitude: cidade.longitude, fuso: cidade.fuso });
  return NextResponse.json({ data: { mapa, cidade } }, { headers: { "Cache-Control": "no-store" } });
}
