/**
 * POST /api/v1/area/publica/[org]/sonho — contar um sonho para a interpretação (migration 0952).
 *
 * Corpo `{ relato }` (de 20 a 1.500 caracteres). A IA lê os símbolos na hora; a resposta traz o primeiro símbolo
 * inteiro e, nos outros, só o nome — o resto abre em `/sonho/[id]/liberar`. Texto que não é sonho é recusado sem
 * cobrar.
 *
 * Cada sonho é uma chamada de IA paga por nós: no máximo `SONHOS_POR_DIA` por pessoa, e 5 a cada 10 minutos.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { RELATO_MAXIMO, RELATO_MINIMO, SONHOS_POR_DIA, configDoSonho, relatoValido } from "@/lib/area-do-cliente/sonho";
import { contarSonho, sonhosHoje } from "@/lib/area-do-cliente/sonho-servidor";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

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
  const cfg = configDoSonho(org.config.sonho);
  if (!cfg.ativo) return ERRO(404, "not_found", "A interpretação de sonhos não está disponível.");

  const corpo = (await req.json().catch(() => null)) as { relato?: unknown } | null;
  const relato = relatoValido(corpo?.relato);
  if (!relato) return ERRO(422, "validation_failed", `Conte o seu sonho com ${RELATO_MINIMO} a ${RELATO_MAXIMO} caracteres.`);

  const limite = await checkRateLimit(`area:sonho:${sessao.contactId}`, 5, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Muitos sonhos seguidos. Espere alguns minutos.");
  if ((await sonhosHoje(admin, org, sessao.contactId)) >= SONHOS_POR_DIA) {
    return ERRO(429, "limite_do_dia", "Por hoje já lemos os seus sonhos. Amanhã você pode contar outro.");
  }

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await contarSonho(admin, { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "" }, {
    contactId: sessao.contactId,
    sessaoId: sessao.sessaoId,
    primeiroNome: primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
    relato,
    precoCents: cfg.preco_cents,
  });
  if (!r.ok) {
    return r.motivo === "nao_e_sonho"
      ? ERRO(422, "nao_e_sonho", "Isso não parece um sonho. Conte o que você sonhou: onde estava, quem aparecia e o que sentiu.")
      : ERRO(503, "indisponivel", "A interpretação de sonhos não está disponível agora. Tente de novo mais tarde — nada foi cobrado.");
  }
  return NextResponse.json({ data: r.sonho }, { headers: { "Cache-Control": "no-store" } });
}
