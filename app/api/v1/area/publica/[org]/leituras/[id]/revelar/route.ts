/**
 * POST /api/v1/area/publica/[org]/leituras/[id]/revelar — virar as cartas de uma leitura paga.
 *
 * O corpo traz as posições que a pessoa tocou na mesa: são o ritual, não decidem a carta (o servidor sorteia,
 * `sortearCartas`). Chamar de novo devolve as MESMAS cartas e, se a IA ainda não tiver escrito, tenta de novo.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { revelarLeitura } from "@/lib/area-do-cliente/leituras-servidor";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const corpo = z.strictObject({ posicoes: z.array(z.number().int().min(0).max(99)).length(3) });
type Ctx = { params: Promise<{ org: string; id: string }> };

const ERRO = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: NextRequest, { params }: Ctx): Promise<Response> {
  const { org: slug, id } = await params;
  const ctx = await contextoDaArea(req, slug);
  if (!ctx) return NAO_ENCONTRADA();
  const { admin, org, sessao } = ctx;
  if (!sessao) return ERRO(401, "unauthenticated", "Entre na sua área.");
  if (!UUID.test(id)) return NAO_ENCONTRADA();
  const lido = corpo.safeParse(await req.json().catch(() => null));
  if (!lido.success) return ERRO(422, "validation_failed", "Escolha três cartas.");

  const limite = await checkRateLimit(`area:leitura-revelar:${sessao.contactId}`, 8, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "A leitura está sendo preparada. Volte em alguns minutos.");

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await revelarLeitura(
    admin,
    { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "" },
    sessao.contactId,
    id,
    primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
  );
  if (!r.ok) {
    return r.motivo === "nao_paga" ? ERRO(402, "nao_paga", "O pagamento ainda não chegou. Assim que chegar, a mesa abre.") : NAO_ENCONTRADA();
  }
  return NextResponse.json({ data: { cartas: r.cartas, leitura: r.leitura } }, { headers: { "Cache-Control": "no-store" } });
}
