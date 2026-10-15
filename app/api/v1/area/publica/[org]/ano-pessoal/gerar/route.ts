/**
 * POST /api/v1/area/publica/[org]/ano-pessoal/gerar — escreve (pela IA) a
 * leitura do Ano Pessoal que já foi paga e ainda não tem texto. A página chama
 * esta rota depois do pagamento; chamar de novo depois de pronta devolve o mesmo
 * texto.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getRequestPool } from "@/lib/agent-engine/db/request-pool";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { numeroDoAnoPessoal } from "@/lib/area-do-cliente/ano-pessoal";
import { gerarAnoPessoal } from "@/lib/area-do-cliente/circulo-ia";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ ano: z.number().int().min(2000).max(2200) });
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Ano inválido.");

  const { data } = await admin
    .from("area_ano_pessoal")
    .select("id, texto")
    .eq("organization_id", org.id)
    .eq("contact_id", sessao.contactId)
    .eq("ano", lido.data.ano)
    .maybeSingle();
  const linha = data as { id: string; texto: string | null } | null;
  if (!linha) return ERRO(404, "not_found", "Leitura não encontrada.");
  if (linha.texto) return NextResponse.json({ data: { texto: linha.texto } });

  const limite = await checkRateLimit(`area:ano-pessoal-gerar:${sessao.contactId}`, 4, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "A leitura está sendo preparada. Volte em alguns minutos.");

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name, birthdate")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const c = contato as { name: string | null; display_name: string | null; birthdate: string | null } | null;
  if (!c?.birthdate) return ERRO(422, "sem_aniversario", "Conte o seu aniversário primeiro.");
  try {
    const gerado = await gerarAnoPessoal(getRequestPool(), llmEdgeConfigFromEnv(env), {
      organizationId: org.id,
      contactId: sessao.contactId,
      empresa: org.config.titulo || org.nome,
      numero: numeroDoAnoPessoal(c.birthdate, lido.data.ano),
      ano: lido.data.ano,
      primeiroNome: primeiroNome(nomeDoContato(c)),
    });
    if (gerado) {
      await admin.from("area_ano_pessoal").update({ texto: gerado.texto, modelo: gerado.modelo }).eq("id", linha.id).is("texto", null);
      return NextResponse.json({ data: { texto: gerado.texto } }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (err) {
    logger.error("[area.ano-pessoal] leitura não gerada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
  }
  return ERRO(502, "ia_sem_resposta", "A leitura está sendo preparada. Volte em alguns minutos.");
}
