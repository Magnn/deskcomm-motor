/**
 * POST /api/v1/area/publica/[org]/circulo/conteudo — o conteúdo do mês do
 * Círculo. Se ainda não existe, a IA o escreve agora (um por organização por
 * mês: o índice único decide quem grava quando duas pessoas chegam juntas).
 *
 * Só para quem está com o Círculo ativo. A página mostra "sendo preparado" e
 * chama esta rota; a resposta traz o conteúdo pronto.
 */
import { NextResponse, type NextRequest } from "next/server";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { assinaturaAtiva, lerAssinatura, mesDoDia } from "@/lib/area-do-cliente/circulo";
import { gerarConteudoDoMes } from "@/lib/area-do-cliente/circulo-ia";
import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

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
  if (!org.config.circulo?.ativo || !assinaturaAtiva(await lerAssinatura(admin, org.id, sessao.contactId), new Date())) {
    return ERRO(403, "forbidden", "Conteúdo de quem está no Círculo.");
  }

  const mes = mesDoDia(diaNoFuso(new Date().toISOString(), org.fuso));
  const ler = async () => {
    const { data } = await admin
      .from("area_conteudos")
      .select("titulo, texto")
      .eq("organization_id", org.id)
      .eq("mes", mes)
      .maybeSingle();
    return data as { titulo: string; texto: string } | null;
  };
  const pronto = await ler();
  if (pronto) return NextResponse.json({ data: pronto }, { headers: { "Cache-Control": "no-store" } });

  // Gerar custa: no máximo três tentativas por organização a cada dez minutos.
  const limite = await checkRateLimit(`area:circulo-conteudo:${org.id}`, 3, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "O conteúdo está sendo preparado. Volte em alguns minutos.");
  try {
    const gerado = await gerarConteudoDoMes(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      empresa: org.config.titulo || org.nome,
      mes,
    });
    if (!gerado) return ERRO(502, "ia_sem_resposta", "O conteúdo está sendo preparado. Volte em alguns minutos.");
    await admin
      .from("area_conteudos")
      .upsert(
        { organization_id: org.id, mes, titulo: gerado.titulo, texto: gerado.texto, modelo: gerado.modelo },
        { onConflict: "organization_id,mes", ignoreDuplicates: true },
      );
  } catch (err) {
    logger.error("[area.circulo] conteúdo do mês não gerado", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "ia_sem_resposta", "O conteúdo está sendo preparado. Volte em alguns minutos.");
  }
  const final = await ler();
  return final ? NextResponse.json({ data: final }, { headers: { "Cache-Control": "no-store" } }) : ERRO(502, "ia_sem_resposta", "Tente de novo.");
}
