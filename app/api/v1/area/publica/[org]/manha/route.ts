/**
 * POST /api/v1/area/publica/[org]/manha — a manhã dela: a carta do dia lida para ela e a energia do dia pelo céu
 * dela (migration 0956).
 *
 * Só para quem tem o Plano da Semana ou o Círculo em dia; sem eles, 403 e a aba Hoje segue com a carta e o horóscopo
 * do signo. Uma chamada de IA por pessoa por dia, guardada: as próximas chamadas do dia leem a gravada.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { assinaturaAtiva, lerAssinatura } from "@/lib/area-do-cliente/circulo";
import { diaNoFuso, primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { temAManha } from "@/lib/area-do-cliente/manha";
import { manhaDoDia } from "@/lib/area-do-cliente/manha-servidor";
import { temPlanoSemanal } from "@/lib/area-do-cliente/plano-semanal";
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
  if (!org.config.carta_do_dia) return ERRO(404, "not_found", "A carta do dia não está disponível.");

  const agora = new Date();
  const [noPlano, validoAte] = await Promise.all([
    temPlanoSemanal(admin, org.id, sessao.contactId, agora),
    org.config.circulo?.ativo ? lerAssinatura(admin, org.id, sessao.contactId) : Promise.resolve(null),
  ]);
  if (!temAManha({ noPlano, noCirculo: assinaturaAtiva(validoAte, agora) })) {
    return ERRO(403, "sem_plano", "A sua manhã vem com o plano.");
  }

  const limite = await checkRateLimit(`area:manha:${sessao.contactId}`, 10, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Espere alguns minutos.");

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name, birthdate")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const c = (contato ?? {}) as { name: string | null; display_name: string | null; birthdate?: string | null };
  const manha = await manhaDoDia(admin, { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "" }, {
    contactId: sessao.contactId,
    dia: diaNoFuso(agora.toISOString(), org.fuso),
    primeiroNome: primeiroNome(nomeDoContato(c)),
    nascimento: c.birthdate ?? null,
    agora,
  });
  if (!manha) return ERRO(503, "indisponivel", "A sua manhã não ficou pronta agora. Tente de novo daqui a pouco.");
  return NextResponse.json({ data: manha }, { headers: { "Cache-Control": "no-store" } });
}
