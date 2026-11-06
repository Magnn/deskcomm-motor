/**
 * POST /api/v1/area/publica/[org]/mapa/leitura — a leitura do mapa astral (migration 0959).
 *
 * Corpo `{ data, hora, cidade_id }`, o mesmo do mapa grátis (`../route.ts`): o servidor calcula o mapa de novo
 * (coordenadas e fuso saem da lista de cidades, nunca do navegador) e a IA escreve a leitura. A resposta traz o Sol
 * inteiro e, nas outras partes, só a posição; o resto abre em `/mapa/leitura/[id]/liberar`.
 *
 * Cada leitura é uma chamada de IA paga por nós: no máximo `LEITURAS_DO_MAPA_POR_DIA` por pessoa, e 5 a cada 10 minutos.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { dataDeNascimentoValida } from "@/lib/area-do-cliente/aniversario";
import { cidadePorId } from "@/lib/area-do-cliente/cidades";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { LEITURAS_DO_MAPA_POR_DIA, configDaLeituraDoMapa } from "@/lib/area-do-cliente/leitura-do-mapa";
import { escreverLeituraDoMapa, leiturasDoMapaHoje } from "@/lib/area-do-cliente/leitura-do-mapa-servidor";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
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
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const cfg = configDaLeituraDoMapa(org.config.leitura_do_mapa);
  if (!cfg.ativo) return ERRO(404, "not_found", "A leitura do mapa não está disponível.");

  const limite = await checkRateLimit(`area:mapa-leitura:${sessao.contactId}`, 5, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  if ((await leiturasDoMapaHoje(admin, org, sessao.contactId)) >= LEITURAS_DO_MAPA_POR_DIA) {
    return ERRO(429, "limite_do_dia", "Por hoje já lemos o seu mapa. Amanhã você pode pedir outra leitura.");
  }
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success || !dataDeNascimentoValida(lido.data.data)) return ERRO(422, "validation_failed", "Confira a data e a hora.");
  const cidade = await cidadePorId(lido.data.cidade_id);
  if (!cidade) return ERRO(422, "validation_failed", "Escolha a cidade na lista.");
  const mapa = calcularMapaNatal({ data: lido.data.data, hora: lido.data.hora, latitude: cidade.latitude, longitude: cidade.longitude, fuso: cidade.fuso });

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await escreverLeituraDoMapa(admin, { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "" }, {
    contactId: sessao.contactId,
    sessaoId: sessao.sessaoId,
    primeiroNome: primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
    mapa,
    nascimento: { data: lido.data.data, hora: lido.data.hora, cidade_id: cidade.id },
    precoCents: cfg.preco_cents,
  });
  if (!r.ok) return ERRO(503, "indisponivel", "A leitura do mapa não está disponível agora. Tente de novo mais tarde — nada foi cobrado.");
  return NextResponse.json({ data: r.leitura }, { headers: { "Cache-Control": "no-store" } });
}
