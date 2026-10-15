/**
 * POST /api/v1/area/publica/[org]/ano-pessoal — comprar a leitura do Ano
 * Pessoal. Só na janela do aniversário e só para quem contou a data. O ano vai
 * nos metadados: é o aviso de pagamento que libera a leitura daquele ano.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { EXTRA_DO_ANO_PESSOAL, janelaDoAnoPessoal } from "@/lib/area-do-cliente/ano-pessoal";
import { SemPagamento, criarCobrancaDaArea } from "@/lib/area-do-cliente/cobranca";
import { diaNoFuso } from "@/lib/area-do-cliente/dados";
import { registrarEvento } from "@/lib/area-do-cliente/eventos";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const corpo = z.strictObject({ forma: z.enum(["pix", "cartao"]) });
type Ctx = { params: Promise<{ org: string }> };
const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  const oferta = org.config.ano_pessoal;
  if (!oferta?.ativo) return ERRO(404, "not_found", "O Ano Pessoal não está disponível.");

  const limite = await checkRateLimit(`area:ano-pessoal:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitas tentativas. Espere alguns minutos.");
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Forma de pagamento inválida.");

  const { data: contato } = await admin
    .from("contacts")
    .select("birthdate")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const nascimento = (contato as { birthdate: string | null } | null)?.birthdate ?? null;
  if (!nascimento) return ERRO(422, "sem_aniversario", "Conte o seu aniversário primeiro.");
  const janela = janelaDoAnoPessoal(nascimento, diaNoFuso(new Date().toISOString(), org.fuso));
  if (!janela.aberta) return ERRO(409, "fora_da_janela", "O Ano Pessoal abre perto do seu aniversário.");

  try {
    const cobranca = await criarCobrancaDaArea(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      forma: lido.data.forma,
      valorCentavos: oferta.preco_cents,
      descricao: `Seu Ano Pessoal ${janela.ano}`,
      produto: "Ano Pessoal",
      extra: EXTRA_DO_ANO_PESSOAL,
      referencia: `ano-pessoal-${sessao.contactId}-${janela.ano}`,
      metadados: { ano: String(janela.ano) },
      mensagemDepoisDePagar: "Pagamento confirmado! Volte para a sua área: a leitura do seu ano já está sendo preparada.",
    });
    await registrarEvento(admin, {
      organizationId: org.id,
      contactId: sessao.contactId,
      tipo: "ano_pessoal_checkout",
      sessaoId: sessao.sessaoId,
      props: { forma: lido.data.forma, ano: janela.ano },
    });
    return NextResponse.json({ data: cobranca }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof SemPagamento) return ERRO(503, "pagamento_indisponivel", "O pagamento não está disponível agora. Fale com a gente.");
    logger.error("[area.ano-pessoal] cobrança não criada", {
      organization_id: org.id,
      motivo: (err instanceof Error ? err.message : String(err)).slice(0, 200),
    });
    return ERRO(502, "pagamento_indisponivel", "Não foi possível gerar o pagamento agora. Tente de novo em instantes.");
  }
}
