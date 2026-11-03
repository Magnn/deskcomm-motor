/**
 * POST /api/v1/area/publica/[org]/vela — acender a vela de 7 dias com uma intenção (migration 0957).
 *
 * Corpo `{ por_quem, pedido }`. Só para quem tem o Plano da Semana ou o Círculo em dia, e uma vela aberta por vez.
 * A IA escreve a oração na hora (uma chamada por vela); pedido que deseja o mal de alguém é recusado sem acender.
 */
import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { assinaturaAtiva, lerAssinatura } from "@/lib/area-do-cliente/circulo";
import { diaNoFuso, primeiroNome } from "@/lib/area-do-cliente/dados";
import { NAO_ENCONTRADA, contextoDaArea } from "@/lib/area-do-cliente/http";
import { pedidoDaVelaValido } from "@/lib/area-do-cliente/intencao";
import { acenderVela } from "@/lib/area-do-cliente/intencao-servidor";
import { temAManha } from "@/lib/area-do-cliente/manha";
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

  const pedido = pedidoDaVelaValido(await req.json().catch(() => null));
  if (!pedido) return ERRO(422, "validation_failed", "Conte por quem você pede e o que pede.");

  const agora = new Date();
  const [noPlano, validoAte] = await Promise.all([
    temPlanoSemanal(admin, org.id, sessao.contactId, agora),
    org.config.circulo?.ativo ? lerAssinatura(admin, org.id, sessao.contactId) : Promise.resolve(null),
  ]);
  if (!temAManha({ noPlano, noCirculo: assinaturaAtiva(validoAte, agora) })) {
    return ERRO(403, "sem_plano", "A vela vem com o plano.");
  }

  const limite = await checkRateLimit(`area:vela:${sessao.contactId}`, 5, 600);
  if (!limite.allowed) return ERRO(429, "rate_limited", "Espere alguns minutos.");

  const { data: contato } = await admin
    .from("contacts")
    .select("name, display_name")
    .eq("id", sessao.contactId)
    .eq("organization_id", org.id)
    .maybeSingle();
  const r = await acenderVela(admin, { id: org.id, nome: org.nome, titulo: org.config.titulo ?? "" }, {
    contactId: sessao.contactId,
    primeiroNome: primeiroNome(nomeDoContato((contato ?? {}) as { name: string | null; display_name: string | null })),
    pedido,
    hoje: diaNoFuso(agora.toISOString(), org.fuso),
  });
  if (!r.ok) {
    if (r.motivo === "ja_tem_vela") return ERRO(409, "ja_tem_vela", "Você já tem uma vela acesa.");
    if (r.motivo === "nao_e_pedido") {
      return ERRO(422, "nao_e_pedido", "A vela é para pedir o bem. Escreva por quem você pede e o que deseja de bom para essa pessoa.");
    }
    return ERRO(503, "indisponivel", "A vela não acendeu agora. Tente de novo daqui a pouco.");
  }
  return NextResponse.json({ data: r.vela }, { headers: { "Cache-Control": "no-store" } });
}
